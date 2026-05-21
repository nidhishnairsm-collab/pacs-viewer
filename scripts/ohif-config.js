// OHIF v3 runtime configuration
// Served dynamically at /ohif/app-config.js by Express (see server/_core/index.ts).
// Editing this file takes effect immediately without rebuilding OHIF.

// ─── PACS Bridge extension ────────────────────────────────────────────────
// loadModule() in OHIF's pluginImports.js passes non-string entries through
// unchanged, so we can inject a plain object as an inline extension here.
// It subscribes to MeasurementService events and posts them to the parent
// window (our OHIFViewer.tsx), and listens for incoming commands from the
// parent (layout switches, etc.).

function buildFindingText(m) {
  if (!m) return '';
  var parts = [];
  // Prettify camelCase tool name: "EllipticalROI" → "Elliptical ROI"
  var tool = (m.toolName || m.type || '').replace(/([A-Z])/g, ' $1').trim();
  if (tool) parts.push(tool);
  if (m.label) parts.push(m.label);

  var textValues = [];
  var dt = m.displayText;
  if (typeof dt === 'string') {
    textValues = [dt];
  } else if (Array.isArray(dt)) {
    // Array of strings or {value, unit} objects
    dt.forEach(function(item) {
      if (typeof item === 'string') textValues.push(item);
      else if (item && typeof item === 'object') {
        var v = item.value || item.text || item.label || '';
        if (v) textValues.push(String(v));
      }
    });
  } else if (dt && typeof dt === 'object') {
    // OHIF v3 format: { primary: string[], secondary: string[] }
    // secondary contains slice/instance context (e.g. "S: 0 I: 1") — irrelevant in a report
    var primary = Array.isArray(dt.primary) ? dt.primary : [];
    primary.forEach(function(s) {
      if (typeof s !== 'string') return;
      // Strip OHIF's "Unknown" anatomy placeholder wherever it appears in the string
      var cleaned = s.replace(/\bUnknown\b/g, '').replace(/\s{2,}/g, ' ').trim();
      if (cleaned) textValues.push(cleaned);
    });
  }
  if (!textValues.length && m.text) textValues = [m.text];
  if (textValues.length) parts.push(textValues.join(', '));
  return parts.join(' — ');
}

var pacsBridgeExtension = {
  id: 'pacs-bridge',

  // preRegistration runs very early — services are not yet available here.
  // Inject CSS to hide OHIF chrome and set up the parent→OHIF command listener.
  preRegistration: function preRegistration() {
    if (window.parent === window) return;
    window._pacsBridgePendingCmds = [];

    // Hide OHIF's AppBar and side-panel tabs so the iframe looks like a bare canvas.
    // !important beats OHIF's inline styles (e.g. height:calc(100vh - 52px)).
    var style = document.createElement('style');
    style.id = 'pacs-bridge-hide-chrome';
    style.textContent = [
      '.bg-popover.z-20.border-background { display:none!important; }',
      '[data-cy="return-to-work-list"] { display:none!important; }',
      'div[style*="calc(100vh - 52px"] { height:100vh!important; }',
      '[data-cy="side-panel-header-left"] { display:none!important; }',
      '[data-cy="side-panel-header-right"] { display:none!important; }',
      // Belt-and-suspenders: hide investigational use banner (primary: config option: "never")
      '[data-cy="confirm-and-hide-button"] { display:none!important; }',
      '.fixed.bottom-2.z-50 { display:none!important; }',
    ].join('\n');
    document.head.appendChild(style);

    window.addEventListener('message', function(event) {
      // Same-origin guard
      try { if (new URL(event.origin).origin !== window.location.origin) return; } catch (_) {}
      var msg = event.data;
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('OHIF_') !== 0) return;
      // Handle theme sync immediately (no commandsManager needed)
      if (msg.type === 'OHIF_SET_THEME') {
        if (msg.theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return;
      }
      // Queue tool/layout commands until onModeEnter wires up the commandsManager
      window._pacsBridgePendingCmds.push(msg);
    });
  },

  // onModeEnter runs after all services are initialised — safe to subscribe
  // to MeasurementService and toolbarService here.
  onModeEnter: function onModeEnter(ctx) {
    if (window.parent === window) return;
    var servicesManager = ctx.servicesManager;
    var commandsManager = ctx.commandsManager;
    var services = servicesManager && servicesManager.services;
    var measurementService = services && services.measurementService;
    var toolbarService = services && services.toolbarService;

    window._pacsBridgeSubs = [];

    if (measurementService) {
      var subAdded = measurementService.subscribe(
        measurementService.EVENTS.MEASUREMENT_ADDED,
        function(event) {
          var m = (event && event.measurement) || event;
          window.parent.postMessage({
            type: 'OHIF_MEASUREMENT_ADDED',
            uid: m && m.uid,
            findingText: buildFindingText(m),
          }, window.location.origin);
        }
      );
      var subUpdated = measurementService.subscribe(
        measurementService.EVENTS.MEASUREMENT_UPDATED,
        function(event) {
          var m = (event && event.measurement) || event;
          window.parent.postMessage({
            type: 'OHIF_MEASUREMENT_UPDATED',
            uid: m && m.uid,
            findingText: buildFindingText(m),
          }, window.location.origin);
        }
      );
      var subRemoved = measurementService.subscribe(
        measurementService.EVENTS.MEASUREMENT_REMOVED,
        function(event) {
          window.parent.postMessage({
            type: 'OHIF_MEASUREMENT_REMOVED',
            uid: event && event.uid,
          }, window.location.origin);
        }
      );
      window._pacsBridgeSubs.push(subAdded, subUpdated, subRemoved);
    }

    // Broadcast active tool changes back to the parent toolbar
    if (toolbarService && toolbarService.EVENTS && toolbarService.EVENTS.TOOL_BAR_MODIFIED) {
      var subToolbar = toolbarService.subscribe(
        toolbarService.EVENTS.TOOL_BAR_MODIFIED,
        function(state) {
          var active = state && state.primary && state.primary.find(function(b) { return b.isActive; });
          if (active) {
            window.parent.postMessage({ type: 'OHIF_TOOL_CHANGED', toolId: active.id }, window.location.origin);
          }
        }
      );
      window._pacsBridgeSubs.push(subToolbar);
    }

    // Process any commands that arrived before mode was ready
    var pending = window._pacsBridgePendingCmds || [];
    pending.forEach(function(msg) { handleCommand(msg, commandsManager); });
    window._pacsBridgePendingCmds = [];

    // Replace the queuing listener with a live one
    window.removeEventListener('message', window._pacsBridgePreRegListener);
    window._pacsBridgeLiveListener = function(event) {
      try { if (new URL(event.origin).origin !== window.location.origin) return; } catch (_) {}
      var msg = event.data;
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('OHIF_') !== 0) return;
      if (msg.type === 'OHIF_SET_THEME') {
        if (msg.theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return;
      }
      handleCommand(msg, commandsManager);
    };
    window.addEventListener('message', window._pacsBridgeLiveListener);
  },

  onModeExit: function onModeExit() {
    (window._pacsBridgeSubs || []).forEach(function(sub) {
      if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
    });
    window._pacsBridgeSubs = [];
    if (window._pacsBridgeLiveListener) {
      window.removeEventListener('message', window._pacsBridgeLiveListener);
      window._pacsBridgeLiveListener = null;
    }
  },
};

function handleCommand(msg, commandsManager) {
  if (!commandsManager) return;
  try {
    switch (msg.type) {
      case 'OHIF_RUN_COMMAND':
        if (msg.commandName) commandsManager.runCommand(msg.commandName, msg.options || {});
        break;
      case 'OHIF_SET_TOOL':
        if (msg.toolName) commandsManager.runCommand('setToolActiveToolbar', { toolName: msg.toolName, toolGroupIds: [] });
        break;
      case 'OHIF_SET_LAYOUT':
        commandsManager.runCommand('setViewportGridLayout', { numRows: msg.numRows || 1, numCols: msg.numCols || 1 });
        break;
      case 'OHIF_TOGGLE_CINE':
        commandsManager.runCommand('toggleCine', {});
        break;
      case 'OHIF_RESET_VIEWPORT':
        commandsManager.runCommand('resetViewport', {});
        break;
      case 'OHIF_FLIP_H':
        commandsManager.runCommand('flipViewportHorizontal', {});
        break;
      case 'OHIF_FLIP_V':
        commandsManager.runCommand('flipViewportVertical', {});
        break;
      case 'OHIF_ROTATE_CW':
        commandsManager.runCommand('rotateViewportCW', {});
        break;
      case 'OHIF_INVERT':
        commandsManager.runCommand('invertViewport', {});
        break;
    }
  } catch (e) {
    console.warn('[PACS Bridge] command error:', e);
  }
}
// ─────────────────────────────────────────────────────────────────────────

window.config = {
  routerBasename: '/ohif',
  extensions: [pacsBridgeExtension],
  modes: [],
  showStudyList: true,
  showLoadingIndicator: true,
  maxNumberOfWebWorkers: 3,
  omitQuotationForMultipartRequest: true,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  investigationalUseDialog: { option: 'never' },
  strictZSpacingForVolumeViewport: false,
  groupEnabledModesFirst: true,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 75,
    prefetch: 25,
  },
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Local PACS',
        name: 'local',
        wadoUriRoot: '/uploads',
        qidoRoot: '/api/dicomweb',
        wadoRoot: '/api/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        supportsStow: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: false,
        singlepart: false,
      },
    },
  ],
  defaultDataSourceName: 'dicomweb',
};
