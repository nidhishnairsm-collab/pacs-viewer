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
  var values = Array.isArray(m.displayText) ? m.displayText
              : m.displayText ? [m.displayText]
              : m.text        ? [m.text]
              : [];
  if (values.length) parts.push(values.join(', '));
  return parts.join(' — ');
}

var pacsBridgeExtension = {
  id: 'pacs-bridge',

  // preRegistration runs very early — services are not yet available here.
  // We only set up the parent-→-OHIF command listener at this stage so it
  // is ready before the mode starts.
  preRegistration: function preRegistration() {
    if (window.parent === window) return;
    window._pacsBridgePendingCmds = [];

    window.addEventListener('message', function(event) {
      // Same-origin guard
      try { if (new URL(event.origin).origin !== window.location.origin) return; } catch (_) {}
      var msg = event.data;
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('OHIF_') !== 0) return;
      // Queue until onModeEnter wires up the commandsManager
      window._pacsBridgePendingCmds.push(msg);
    });
  },

  // onModeEnter runs after all services are initialised — safe to subscribe
  // to MeasurementService here.
  onModeEnter: function onModeEnter(ctx) {
    if (window.parent === window) return;
    var servicesManager = ctx.servicesManager;
    var commandsManager = ctx.commandsManager;
    var measurementService = servicesManager && servicesManager.services && servicesManager.services.measurementService;

    if (measurementService) {
      var sub = measurementService.subscribe(
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
      window._pacsBridgeMeasurementSub = sub;
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
      handleCommand(msg, commandsManager);
    };
    window.addEventListener('message', window._pacsBridgeLiveListener);
  },

  onModeExit: function onModeExit() {
    if (window._pacsBridgeMeasurementSub) {
      window._pacsBridgeMeasurementSub.unsubscribe();
      window._pacsBridgeMeasurementSub = null;
    }
    if (window._pacsBridgeLiveListener) {
      window.removeEventListener('message', window._pacsBridgeLiveListener);
      window._pacsBridgeLiveListener = null;
    }
  },
};

function handleCommand(msg, commandsManager) {
  if (!commandsManager) return;
  try {
    if (msg.type === 'OHIF_RUN_COMMAND' && msg.commandName) {
      commandsManager.runCommand(msg.commandName, msg.options || {});
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
