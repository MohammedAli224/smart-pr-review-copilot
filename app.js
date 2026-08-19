(() => {
  'use strict';

  const INTEGRATION_CONFIG = {
    mode: 'mock',
    endpoint: '',
    apiKey: '',
    timeoutMs: 1500
  };

  const els = {
    input: document.getElementById('diff-input'),
    analyzeBtn: document.getElementById('analyze-btn'),
    clearBtn: document.getElementById('clear-btn'),
    sampleButtons: Array.from(document.querySelectorAll('.btn-sample')),
    empty: document.getElementById('result-empty'),
    loading: document.getElementById('result-loading'),
    error: document.getElementById('error-area'),
    card: document.getElementById('result-card'),
    riskCard: document.querySelector('.risk-score-card'),
    riskScore: document.getElementById('risk-score'),
    impactedAreas: document.getElementById('impacted-areas')
  };

  const SYSTEM_PROMPT =
    'You are a code review copilot. Analyze the given Git diff. ' +
    'Respond ONLY with valid JSON in exactly this shape: ' +
    '{"risk_score":"High","impacted_areas":["str","str"]}. ' +
    'risk_score must be exactly Low, Medium, or High. ' +
    'impacted_areas must contain 1 to 5 short semantic areas.';

  const MOCK_SAMPLES = {
    low: [
      'diff --git a/web/static/css/app.css b/web/static/css/app.css',
      'index 1a2b3c4..5d6e7f8 100644',
      '--- a/web/static/css/app.css',
      '+++ b/web/static/css/app.css',
      '@@ -45,7 +45,7 @@',
      ' .btn {',
      '-  background-color: #1f2933;',
      '+  background-color: #2563eb;',
      ' }',
      '',
      'diff --git a/web/templates/home.html b/web/templates/home.html',
      'index 9a8b7c6..0f1e2d3 100644',
      '--- a/web/templates/home.html',
      '+++ b/web/templates/home.html',
      '@@ -22,6 +22,6 @@',
      ' <button class="btn">',
      '-  Sign up',
      '+  Get started',
      ' </button>'
    ].join('\n'),

    medium: [
      'diff --git a/app/controllers/OrderController.php b/app/controllers/OrderController.php',
      'index a1b2c3d..e4f5a6b 100644',
      '--- a/app/controllers/OrderController.php',
      '+++ b/app/controllers/OrderController.php',
      '@@ -38,9 +38,10 @@ class OrderController',
      '-        $orders = $this->orderService->getAll();',
      '+        $orders = $this->orderService->getPage($request->get(\'page\', 1));',
      '+        $this->logger->info(\'Fetched order page\', [\'count\' => count($orders)]);',
      '',
      'diff --git a/app/services/InventoryService.php b/app/services/InventoryService.php',
      'index c3d4e5f..6a7b8c9 100644',
      '--- a/app/services/InventoryService.php',
      '+++ b/app/services/InventoryService.php',
      '@@ -12,7 +12,7 @@ class InventoryService',
      '-    public function reserve($sku, $qty)',
      '+    public function reserve($sku, $qty, $batchId = null)',
      '     {',
      '-        $this->stock->decrement($sku, $qty);',
      '+        $this->stock->decrement($sku, $qty);',
      '+        $this->stock->hold($batchId);'
    ].join('\n'),

    high: [
      'diff --git a/db/migrations/002_add_payments.sql b/db/migrations/002_add_payments.sql',
      'index 1112223..4445556 100644',
      '--- a/db/migrations/002_add_payments.sql',
      '+++ b/db/migrations/002_add_payments.sql',
      '@@ -1,9 +1,10 @@',
      '-ALTER TABLE payments ADD COLUMN status VARCHAR(20) DEFAULT \'pending\';',
      '+ALTER TABLE payments DROP COLUMN status;',
      '+DROP INDEX idx_payments_user;',
      '',
      'diff --git a/src/auth/AuthService.php b/src/auth/AuthService.php',
      'index 7f6e5d4..3c2b1a0 100644',
      '--- a/src/auth/AuthService.php',
      '+++ b/src/auth/AuthService.php',
      '@@ -55,8 +55,8 @@ class AuthService',
      '-        $token = $this->tokenStore->issue($user);',
      '+        $token = $this->tokenStore->issue($user, \'auto\');',
      '+        $this->secretStore->rotate();'
    ].join('\n')
  };

  function setLoading(isLoading) {
    els.analyzeBtn.disabled = isLoading;
    els.loading.classList.toggle('hidden', !isLoading);

    if (isLoading) {
      els.empty.classList.add('hidden');
      els.card.classList.add('hidden');
      hideError();
    }
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.remove('hidden');
  }

  function hideError() {
    els.error.classList.add('hidden');
    els.error.textContent = '';
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function containsAny(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
  }

  function extractImpactedAreas(diff) {
    const lower = diff.toLowerCase();
    const areas = [];

    const rules = [
      {
        label: 'Authentication',
        keywords: ['auth/', '/auth', 'authentication', 'password', 'login', 'session', 'credential']
      },
      {
        label: 'Payments',
        keywords: ['payment', 'payments', 'billing', 'checkout', 'invoice', 'charge']
      },
      {
        label: 'Database Schema',
        keywords: ['migration', 'migrations', 'schema', '.sql', 'alter table', 'drop table', 'drop column']
      },
      {
        label: 'Public API',
        keywords: ['api/', '/api', 'endpoint', 'route', 'controller']
      },
      {
        label: 'API Layer',
        keywords: ['handler', 'service']
      },
      {
        label: 'UI Layer',
        keywords: ['.css', '.scss', '.html', '.jsx', '.tsx', 'component', 'button', 'template']
      },
      {
        label: 'Data Storage',
        keywords: ['json.dump', 'json.load', 'file_path', 'open(', 'write(', 'storage', 'record', 'trajs']
      },
      {
        label: 'Business Logic',
        keywords: ['update_record', 'get_reward', 'get_metrics', 'process', 'repository', 'usecase']
      }
    ];

    rules.forEach((rule) => {
      if (areas.length < 5 && containsAny(lower, rule.keywords)) {
        areas.push(rule.label);
      }
    });

    if (areas.length === 0) {
      areas.push('General code changes');
    }

    return areas.slice(0, 5);
  }

  function fallbackAnalysis(text) {
    const lower = text.toLowerCase();

    const highRiskKeywords = [
      'auth/', '/auth', 'authentication', 'token', 'password', 'secret',
      'permission', 'role', 'payment', 'payments', 'billing', 'schema',
      'migration', 'drop table', 'drop column', 'alter table', 'database'
    ];

    const mediumRiskKeywords = [
      'service', 'controller', 'api/', '/api', 'endpoint', 'route',
      'query', 'transaction', 'cache', 'queue', 'repository', 'business logic'
    ];

    let riskScore = 'Low';

    if (containsAny(lower, highRiskKeywords)) {
      riskScore = 'High';
    } else if (containsAny(lower, mediumRiskKeywords)) {
      riskScore = 'Medium';
    }

    return {
      risk_score: riskScore,
      impacted_areas: extractImpactedAreas(text)
    };
  }

  function callMockModel(prompt) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const result = fallbackAnalysis(prompt);
          resolve(JSON.stringify(result));
        } catch (error) {
          reject(error);
        }
      }, INTEGRATION_CONFIG.timeoutMs);
    });
  }

  function callApprovedModel(prompt) {
    if (INTEGRATION_CONFIG.mode === 'external') {
      return callExternalModel(prompt);
    }

    return callMockModel(prompt);
  }

  function buildExternalRequest(prompt) {
    const headers = { 'Content-Type': 'application/json' };

    if (INTEGRATION_CONFIG.apiKey) {
      headers.Authorization = 'Bearer ' + INTEGRATION_CONFIG.apiKey;
    }

    return {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt })
    };
  }

  async function callExternalModel(prompt) {
    if (!INTEGRATION_CONFIG.endpoint) {
      throw new Error('Model endpoint is not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      INTEGRATION_CONFIG.timeoutMs
    );

    try {
      const response = await fetch(
        INTEGRATION_CONFIG.endpoint,
        {
          ...buildExternalRequest(prompt),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error('Model request failed with status ' + response.status);
      }

      const text = await response.text();

      if (!text.trim()) {
        throw new Error('Model returned an empty response');
      }

      const data = JSON.parse(text);

      if (!isValidResult(data)) {
        throw new Error('Model returned invalid JSON');
      }

      return JSON.stringify(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Model request timed out');
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function isValidResult(data) {
    return Boolean(
      data &&
      typeof data === 'object' &&
      ['Low', 'Medium', 'High'].includes(data.risk_score) &&
      Array.isArray(data.impacted_areas) &&
      data.impacted_areas.length >= 1 &&
      data.impacted_areas.length <= 5
    );
  }

  function renderResult(data) {
    const level = data.risk_score.toLowerCase();
    const badgeClass = ['low', 'medium', 'high'].includes(level)
      ? level
      : 'medium';

    els.riskScore.textContent = capitalize(level);
    els.riskScore.className = 'risk-score ' + badgeClass;
    els.riskCard.className = 'risk-score-card ' + badgeClass;
    els.impactedAreas.innerHTML = '';

    data.impacted_areas.slice(0, 5).forEach((area) => {
      const li = document.createElement('li');
      li.textContent = area;
      els.impactedAreas.appendChild(li);
    });

    els.empty.classList.add('hidden');
    els.card.classList.remove('hidden');
  }

  async function analyzeDiff(text) {
    setLoading(true);

    try {
      const prompt =
        SYSTEM_PROMPT +
        '\n\nHere is the Git diff to analyze:\n"""\n' +
        text +
        '\n"""';

      const raw = await callApprovedModel(prompt);
      const data = JSON.parse(raw);

      if (!isValidResult(data)) {
        throw new Error('Invalid model response');
      }

      renderResult(data);
    } catch (error) {
      renderResult(fallbackAnalysis(text));
    } finally {
      setLoading(false);
    }
  }
