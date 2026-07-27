(function attachMainAdvancedSearchModule(global) {
  const FIELD_LABELS = {
    q: 'Query',
    ocrQ: 'OCR search',
    subtitleQ: 'Subtitle search',
    tag: 'Tag search',
    type: 'Type'
  };
  const FIELD_ORDER = Object.keys(FIELD_LABELS);
  const STORAGE_KEY_PREFIX = 'mam.advanced.searches:';

  function createMainAdvancedSearchModule(deps = {}) {
    const {
      searchForm,
      t = (key) => key,
      loadAssets,
      updateClearSearchButtonState = () => {},
      canUseAdvancedSearch = () => true,
      initialUserIdentity = ''
    } = deps;
    const modal = document.getElementById('advancedSearchModal');
    const fieldsEl = document.getElementById('advancedSearchFields');
    const availableFieldsEl = document.getElementById('advancedSearchAvailableFields');
    const todayCheck = document.getElementById('advancedSearchToday');
    const savedSelect = document.getElementById('advancedSearchSaved');
    const dateOrderInputs = modal?.querySelectorAll('input[name="advancedDateOrder"]');
    const dateFieldSelect = modal?.querySelector('select[name="dateField"]');
    const state = { and: [...FIELD_ORDER], or: [] };
    const datePicker = { element: null, inputName: '', month: new Date() };
    let storageKey = getStorageKey(initialUserIdentity);
    let enabled = false;

    function getStorageKey(identity) {
      const normalized = String(identity || '').trim().toLowerCase() || 'anonymous';
      return `${STORAGE_KEY_PREFIX}${encodeURIComponent(normalized)}`;
    }

    function readSaved() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object').slice(0, 5) : [];
      } catch (_error) {
        return [];
      }
    }

    function writeSaved(items) {
      try { localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 5))); } catch (_error) { /* storage is optional */ }
    }

    function fieldValue(field) {
      return String(searchForm?.querySelector(`[name="${field}"]`)?.value || '').trim();
    }

    function setFieldValue(field, value) {
      const input = searchForm?.querySelector(`[name="${field}"]`);
      if (input) input.value = String(value || '');
    }

    function setDateFieldValue(field, value) {
      const normalized = String(value || '');
      setFieldValue(field, normalized);
      const input = modal?.querySelector(`input[name="${field}"]`);
      if (input) input.value = normalized;
      const displayInput = modal?.querySelector(`[data-date-input="${field}"]`);
      if (displayInput) displayInput.value = formatDateForDisplay(normalized);
    }

    function dateFieldValue(field) {
      const modalValue = modal?.querySelector(`input[name="${field}"]`)?.value;
      return String(modalValue || fieldValue(field) || '').trim();
    }

    function formatDateForDisplay(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
      const [year, month, day] = String(value).split('-');
      return `${day}.${month}.${year}`;
    }

    function parseTypedDate(value) {
      const raw = String(value || '').trim();
      const match = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(raw);
      if (!match) return '';
      const [, day, month, year] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) return '';
      return `${year}-${month}-${day}`;
    }

    function isoDate(year, month, day) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function renderDatePicker() {
      if (!datePicker.element) return;
      const locale = document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-US';
      const year = datePicker.month.getFullYear();
      const month = datePicker.month.getMonth();
      const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(datePicker.month);
      const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + ((index + 1) % 7))));
      const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const selected = dateFieldValue(datePicker.inputName);
      const days = [];
      for (let index = 0; index < firstDay; index += 1) days.push('<span class="date-picker-empty"></span>');
      for (let day = 1; day <= daysInMonth; day += 1) {
        const value = isoDate(year, month, day);
        days.push(`<button type="button" class="date-picker-day${value === selected ? ' is-selected' : ''}" data-date-value="${value}">${day}</button>`);
      }
      datePicker.element.innerHTML = `
        <div class="date-picker-head">
          <button type="button" data-date-nav="prev" aria-label="${t('date_picker_prev')}">‹</button>
          <strong>${monthLabel}</strong>
          <button type="button" data-date-nav="next" aria-label="${t('date_picker_next')}">›</button>
        </div>
        <div class="date-picker-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join('')}</div>
        <div class="date-picker-grid">${days.join('')}</div>
        <button type="button" class="date-picker-today" data-date-today="1">${t('date_picker_today')}</button>`;
    }

    function openDatePicker(inputName, input) {
      if (!datePicker.element) {
        datePicker.element = document.createElement('div');
        datePicker.element.className = 'date-picker-popover';
        document.body.appendChild(datePicker.element);
        datePicker.element.addEventListener('click', (event) => {
          const nav = event.target.closest('[data-date-nav]');
          if (nav) {
            event.preventDefault();
            event.stopPropagation();
            const delta = nav.dataset.dateNav === 'next' ? 1 : -1;
            datePicker.month = new Date(
              datePicker.month.getFullYear(),
              datePicker.month.getMonth() + delta,
              1
            );
            renderDatePicker();
            datePicker.element.classList.add('is-open');
            return;
          }
          const day = event.target.closest('[data-date-value]');
          if (day) {
            setDateFieldValue(datePicker.inputName, day.dataset.dateValue);
            syncHiddenInput();
            datePicker.element.classList.remove('is-open');
            return;
          }
          if (event.target.closest('[data-date-today]')) {
            const today = new Date();
            setDateFieldValue(datePicker.inputName, isoDate(today.getFullYear(), today.getMonth(), today.getDate()));
            syncHiddenInput();
            datePicker.element.classList.remove('is-open');
          }
        });
      }
      datePicker.inputName = inputName;
      const selected = dateFieldValue(inputName);
      const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selected);
      datePicker.month = parsed ? new Date(Number(parsed[1]), Number(parsed[2]) - 1, 1) : new Date();
      renderDatePicker();
      const rect = input.getBoundingClientRect();
      datePicker.element.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
      datePicker.element.style.top = `${rect.bottom + window.scrollY + 4}px`;
      datePicker.element.classList.add('is-open');
    }

    function dateField() {
      const value = dateFieldSelect?.value || fieldValue('dateField') || 'created';
      return value === 'updated' ? 'updated' : 'created';
    }

    function setDateField(value) {
      const normalized = value === 'updated' ? 'updated' : 'created';
      setFieldValue('dateField', normalized);
      if (dateFieldSelect) dateFieldSelect.value = normalized;
      const direction = String(sortValue() || '').endsWith('_asc') ? 'asc' : 'desc';
      setSortValue(`${normalized}_${direction}`);
    }

    function sortValue() {
      return String(searchForm?.querySelector('[name="sortBy"]')?.value || '').trim();
    }

    function setSortValue(value) {
      const normalized = ['created_asc', 'created_desc', 'updated_asc', 'updated_desc'].includes(String(value || '')) ? String(value) : 'created_desc';
      const input = searchForm?.querySelector('[name="sortBy"]');
      if (input) input.value = normalized;
      dateOrderInputs?.forEach((radio) => { radio.checked = radio.value === normalized; });
    }

    function normalizedState() {
      const active = (list) => list.filter((field) => fieldValue(field));
      return { and: active(state.and), or: active(state.or) };
    }

    function syncHiddenInput() {
      const input = searchForm?.querySelector('[name="advancedSearch"]');
      if (!input) return;
      if (!enabled) {
        input.value = '';
        return;
      }
      const current = normalizedState();
      const uploadDateFrom = dateFieldValue('uploadDateFrom');
      const uploadDateTo = dateFieldValue('uploadDateTo');
      const selectedDateField = dateField();
      setFieldValue('uploadDateFrom', uploadDateFrom);
      setFieldValue('uploadDateTo', uploadDateTo);
      setFieldValue('dateField', selectedDateField);
      const hasDateRange = Boolean(uploadDateFrom || uploadDateTo);
      input.value = current.and.length || current.or.length || hasDateRange
        ? JSON.stringify({
          ...current,
          values: Object.fromEntries([
            ...FIELD_ORDER.map((field) => [field, fieldValue(field)]),
            ['uploadDateFrom', uploadDateFrom],
            ['uploadDateTo', uploadDateTo],
            ['dateField', selectedDateField],
            ['sortBy', sortValue()]
          ])
        })
        : '';
    }

    function makeField(field) {
      const item = document.createElement('div');
      item.className = 'advanced-search-field';
      item.draggable = true;
      item.dataset.advancedField = field;
      item.innerHTML = `<strong>${t(`advanced_field_${field}`) || FIELD_LABELS[field]}</strong><input type="text" value="" aria-label="${FIELD_LABELS[field]}" />`;
      const input = item.querySelector('input');
      input.value = fieldValue(field);
      input.addEventListener('input', () => {
        setFieldValue(field, input.value);
        syncHiddenInput();
      });
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', field);
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      return item;
    }

    function moveField(field, group) {
      state.and = state.and.filter((item) => item !== field);
      state.or = state.or.filter((item) => item !== field);
      state[group].push(field);
      render();
    }

    function render() {
      if (!fieldsEl || !availableFieldsEl || !modal) return;
      availableFieldsEl.innerHTML = '';
      const assigned = new Set([...state.and, ...state.or]);
      FIELD_ORDER.filter((field) => !assigned.has(field)).forEach((field) => availableFieldsEl.appendChild(makeField(field)));
      ['and', 'or'].forEach((group) => {
        const zone = modal.querySelector(`[data-advanced-drop="${group}"]`);
        if (!zone) return;
        zone.innerHTML = '';
        state[group].forEach((field) => zone.appendChild(makeField(field)));
      });
      modal.querySelectorAll('[data-advanced-drop]').forEach((zone) => {
        zone.ondragover = (event) => { event.preventDefault(); zone.classList.add('drag-over'); };
        zone.ondragleave = () => zone.classList.remove('drag-over');
        zone.ondrop = (event) => {
          event.preventDefault();
          zone.classList.remove('drag-over');
          const field = event.dataTransfer.getData('text/plain');
          if (FIELD_ORDER.includes(field)) moveField(field, zone.dataset.advancedDrop);
        };
      });
      syncHiddenInput();
    }

    function refreshSavedOptions() {
      if (!savedSelect) return;
      const current = savedSelect.value;
      savedSelect.innerHTML = `<option value="">${t('advanced_saved_searches') || 'Saved searches'}</option>`;
      readSaved().forEach((item, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = String(item.name || `Search ${index + 1}`);
        savedSelect.appendChild(option);
      });
      savedSelect.value = current;
      updateSavedActions();
    }

    function updateSavedActions() {
      const hasSelection = Boolean(savedSelect?.value);
      const loadButton = document.getElementById('advancedSearchLoadBtn');
      const deleteButton = document.getElementById('advancedSearchDeleteBtn');
      if (loadButton) loadButton.disabled = !hasSelection;
      if (deleteButton) deleteButton.disabled = !hasSelection;
    }

    function open() {
      if (!canUseAdvancedSearch()) return;
      enabled = true;
      setDateFieldValue('uploadDateFrom', fieldValue('uploadDateFrom'));
      setDateFieldValue('uploadDateTo', fieldValue('uploadDateTo'));
      setDateField(fieldValue('dateField') || (String(sortValue()).startsWith('updated_') ? 'updated' : 'created'));
      setSortValue(sortValue());
      if (todayCheck) todayCheck.checked = false;
      render();
      refreshSavedOptions();
      modal?.classList.remove('hidden');
      modal?.querySelector('.advanced-search-field input')?.focus();
    }

    function close() { modal?.classList.add('hidden'); }

    // A direct edit in the first-column search form starts a normal search.
    // Keep the last advanced layout available for reopening, but remove it
    // from the active request so it cannot override the new form filters.
    function deactivateForDirectSearch() {
      enabled = false;
      const input = searchForm?.querySelector('[name="advancedSearch"]');
      if (input) input.value = '';
      close();
    }

    function clear() {
      enabled = false;
      FIELD_ORDER.forEach((field) => setFieldValue(field, ''));
      setDateFieldValue('uploadDateFrom', '');
      setDateFieldValue('uploadDateTo', '');
      setDateField('created');
      setSortValue('created_desc');
      if (todayCheck) todayCheck.checked = false;
      state.and = [...FIELD_ORDER];
      state.or = [];
      render();
    }

    async function apply() {
      if (!canUseAdvancedSearch()) return;
      syncHiddenInput();
      updateClearSearchButtonState();
      close();
      await loadAssets?.();
    }

    function save() {
      const name = window.prompt(t('advanced_save_name') || 'Saved search name');
      const trimmed = String(name || '').trim();
      if (!trimmed) return;
      const items = readSaved().filter((item) => item.name !== trimmed);
      items.unshift({
        name: trimmed,
        state: normalizedState(),
        values: Object.fromEntries([
          ...FIELD_ORDER.map((field) => [field, fieldValue(field)]),
          ['uploadDateFrom', dateFieldValue('uploadDateFrom')],
          ['uploadDateTo', dateFieldValue('uploadDateTo')],
          ['dateField', dateField()],
          ['sortBy', sortValue()]
        ])
      });
      writeSaved(items);
      refreshSavedOptions();
      savedSelect.value = '0';
      updateSavedActions();
    }

    function loadSaved() {
      const index = Number(savedSelect?.value);
      const item = readSaved()[index];
      if (!item) return;
      enabled = true;
      const nextState = item.state && typeof item.state === 'object' ? item.state : { and: FIELD_ORDER, or: [] };
      state.and = FIELD_ORDER.filter((field) => Array.isArray(nextState.and) && nextState.and.includes(field));
      state.or = FIELD_ORDER.filter((field) => Array.isArray(nextState.or) && nextState.or.includes(field) && !state.and.includes(field));
      FIELD_ORDER.forEach((field) => setFieldValue(field, item.values?.[field] || ''));
      setDateFieldValue('uploadDateFrom', item.values?.uploadDateFrom || '');
      setDateFieldValue('uploadDateTo', item.values?.uploadDateTo || '');
      setDateField(item.values?.dateField || (String(item.values?.sortBy || '').startsWith('updated_') ? 'updated' : 'created'));
      setSortValue(item.values?.sortBy || 'created_desc');
      const assigned = new Set([...state.and, ...state.or]);
      FIELD_ORDER.filter((field) => !assigned.has(field)).forEach((field) => state.and.push(field));
      render();
    }

    function deleteSaved() {
      const index = Number(savedSelect?.value);
      if (!Number.isInteger(index) || index < 0) return;
      const items = readSaved();
      if (!items[index]) return;
      items.splice(index, 1);
      writeSaved(items);
      if (savedSelect) savedSelect.value = '';
      refreshSavedOptions();
    }

    function setUserIdentity(identity) {
      storageKey = getStorageKey(identity);
      if (savedSelect) savedSelect.value = '';
      refreshSavedOptions();
    }

    function refreshLanguage() {
      render();
      refreshSavedOptions();
      if (datePicker.element?.classList.contains('is-open')) renderDatePicker();
    }

    function init() {
      document.getElementById('advancedSearchBtn')?.addEventListener('click', open);
      document.getElementById('advancedSearchCloseBtn')?.addEventListener('click', close);
      document.getElementById('advancedSearchHelpBtn')?.addEventListener('click', () => {
        const button = document.getElementById('advancedSearchHelpBtn');
        const help = document.getElementById('advancedSearchHelpText');
        if (!button || !help) return;
        const isHidden = help.classList.toggle('hidden');
        button.setAttribute('aria-expanded', String(!isHidden));
      });
      document.getElementById('advancedSearchApplyBtn')?.addEventListener('click', () => apply().catch(() => {}));
      document.getElementById('advancedSearchClearBtn')?.addEventListener('click', clear);
      document.getElementById('advancedSearchSaveBtn')?.addEventListener('click', save);
      document.getElementById('advancedSearchLoadBtn')?.addEventListener('click', loadSaved);
      document.getElementById('advancedSearchDeleteBtn')?.addEventListener('click', deleteSaved);
      savedSelect?.addEventListener('change', updateSavedActions);
      modal?.addEventListener('click', (event) => { if (event.target === modal) close(); });
      FIELD_ORDER.forEach((field) => {
        searchForm?.querySelector(`[name="${field}"]`)?.addEventListener('input', syncHiddenInput);
      });
      modal?.querySelectorAll('[data-date-input]').forEach((input) => {
        input.addEventListener('focus', () => openDatePicker(input.dataset.dateInput, input));
        input.addEventListener('click', () => openDatePicker(input.dataset.dateInput, input));
        input.addEventListener('change', () => {
          const value = parseTypedDate(input.value);
          if (value) setDateFieldValue(input.dataset.dateInput, value);
          else input.value = formatDateForDisplay(dateFieldValue(input.dataset.dateInput));
          syncHiddenInput();
        });
      });
      document.addEventListener('click', (event) => {
        if (datePicker.element?.classList.contains('is-open')
          && !datePicker.element.contains(event.target)
          && !event.target.closest('[data-date-input]')) {
          datePicker.element.classList.remove('is-open');
        }
      });
      dateFieldSelect?.addEventListener('change', () => {
        setDateField(dateFieldSelect.value);
        syncHiddenInput();
      });
      dateOrderInputs?.forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) setSortValue(radio.value);
          syncHiddenInput();
        });
      });
      todayCheck?.addEventListener('change', () => {
        if (todayCheck.checked) {
          const today = new Date();
          const value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
          setDateFieldValue('uploadDateTo', value);
        } else {
          setDateFieldValue('uploadDateTo', '');
        }
        syncHiddenInput();
      });
      refreshSavedOptions();
      syncHiddenInput();
    }

    return { init, open, close, clear, syncHiddenInput, deactivateForDirectSearch, setUserIdentity, refreshLanguage };
  }

  global.createMainAdvancedSearchModule = createMainAdvancedSearchModule;
})(window);
