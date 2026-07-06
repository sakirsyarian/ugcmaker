(function () {
  const $ = (sel) => document.querySelector(sel);

  const PROVIDER_URLS = {
    byteplus: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    kie: 'https://api.kie.ai'
  };

  const PROVIDER_KEY_LINKS = {
    byteplus: {
      href: 'https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey?apikey=%7B%7D',
      label: 'BytePlus console'
    },
    kie: {
      href: 'https://kie.ai/api-key',
      label: 'kie.ai API key page'
    }
  };

  function init() {
    loadSettings();
    setupToggleKey();
    setupProviderRules();
    setupModelRules();
    setupSave();
    refreshCredits();
  }

  function getProvider() {
    const select = $('#api-provider-select');
    return select ? select.value : 'byteplus';
  }

  function loadSettings() {
    const s = window.__currentSettings;
    if (!s) return;

    if (s.api_provider && $('#api-provider-select')) {
      $('#api-provider-select').value = s.api_provider;
    }
    if (s.api_key) $('#api-key-input').value = s.api_key;
    if (s.api_base_url) $('#api-url-input').value = s.api_base_url;
    if (s.default_resolution) $('#def-resolution').value = s.default_resolution;
    if (s.default_ratio) $('#def-ratio').value = s.default_ratio;
    if (s.default_model) $('#def-model').value = s.default_model;
    if (s.default_duration) $('#def-duration').value = s.default_duration;
  }

  function setupToggleKey() {
    const btn = $('#toggle-key');
    const input = $('#api-key-input');

    btn.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  }

  function setupProviderRules() {
    const providerSelect = $('#api-provider-select');
    if (!providerSelect) return;

    providerSelect.addEventListener('change', () => {
      const provider = getProvider();
      const urlInput = $('#api-url-input');
      if (urlInput && (!urlInput.value || Object.values(PROVIDER_URLS).includes(urlInput.value))) {
        urlInput.value = PROVIDER_URLS[provider];
      }
      syncProviderUi();
      refreshCredits();
    });

    syncProviderUi();
  }

  function syncProviderUi() {
    const provider = getProvider();
    const hint = $('#api-key-hint');
    const link = $('#api-key-link');
    const creditsGroup = $('#credits-group');
    const keyInfo = PROVIDER_KEY_LINKS[provider] || PROVIDER_KEY_LINKS.byteplus;

    if (link) {
      link.href = keyInfo.href;
      link.textContent = keyInfo.label;
    }
    if (hint && link) {
      hint.innerHTML = `Required for video generation. Get your key from <a href="${keyInfo.href}" target="_blank" rel="noopener noreferrer" id="api-key-link">${keyInfo.label}</a>.`;
    }
    if (creditsGroup) {
      creditsGroup.hidden = provider !== 'kie';
    }

    const model = $('#def-model');
    if (model) {
      model.querySelectorAll('option[data-kie-only="true"]').forEach((option) => {
        option.hidden = provider !== 'kie';
        option.disabled = provider !== 'kie';
      });
      if (provider !== 'kie' && model.value === 'seedance-2.0-mini') {
        model.value = 'seedance-2.0';
      }
    }

    syncModelResolutionRules();
  }

  function setupModelRules() {
    const model = $('#def-model');
    const provider = $('#api-provider-select');
    if (!model) return;

    model.addEventListener('change', syncModelResolutionRules);
    if (provider) provider.addEventListener('change', syncModelResolutionRules);
    syncModelResolutionRules();
  }

  function syncModelResolutionRules() {
    const model = $('#def-model');
    const resolution = $('#def-resolution');
    if (!model || !resolution) return;

    const provider = getProvider();
    const modelValue = model.value;
    const fullHd = resolution.querySelector('option[value="1080p"]');
    const fourK = resolution.querySelector('option[value="4k"]');

    if (fourK) {
      fourK.hidden = provider !== 'kie' || modelValue !== 'seedance-2.0';
      fourK.disabled = provider !== 'kie' || modelValue !== 'seedance-2.0';
    }

    const fastLike = modelValue === 'seedance-2.0-fast' || modelValue === 'seedance-2.0-mini';
    if (fullHd) {
      fullHd.disabled = fastLike;
      if (fastLike && resolution.value === '1080p') {
        resolution.value = '720p';
      }
    }

    if (fourK && (fourK.disabled || fourK.hidden) && resolution.value === '4k') {
      resolution.value = '720p';
    }
  }

  async function refreshCredits() {
    const creditsGroup = $('#credits-group');
    const creditsDisplay = $('#credits-display');
    if (!creditsGroup || !creditsDisplay || getProvider() !== 'kie') return;

    creditsDisplay.textContent = 'Loading credits...';

    try {
      const res = await fetch('/api/settings/credits');
      const data = await res.json();
      if (res.ok) {
        creditsDisplay.textContent = `${data.credits} credits available`;
      } else {
        creditsDisplay.textContent = data.error || 'Unable to load credits';
      }
    } catch (err) {
      creditsDisplay.textContent = 'Unable to load credits';
    }
  }

  function setupSave() {
    const btn = $('#save-btn');

    btn.addEventListener('click', async () => {
      const data = {
        api_provider: getProvider(),
        api_key: $('#api-key-input').value.trim(),
        api_base_url: $('#api-url-input').value.trim(),
        default_resolution: $('#def-resolution').value,
        default_ratio: $('#def-ratio').value,
        default_model: $('#def-model').value,
        default_duration: $('#def-duration').value
      };

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          showToast('Settings saved', 'success');
          refreshCredits();
        } else {
          showToast('Failed to save', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      }

      btn.disabled = false;
      btn.textContent = 'Save Settings';
    });
  }

  function showToast(message, type) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
