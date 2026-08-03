(function attachAdminSystemHealthModule(global) {
  function createAdminSystemHealthModule(deps = {}) {
    const {
      api,
      t,
      escapeHtml,
      formatDateTime,
      renderRuntimeDiagnostics,
      elements = {}
    } = deps;
    if (typeof api !== 'function') throw new TypeError('api must be a function');

    const {
      ffmpegHealth,
      systemHealthRows,
      systemJobStatus,
      overviewActiveAssets,
      overviewTotalAssets,
      overviewSystemHealth,
      overviewSystemHealthSub,
      overviewOpenErrors,
      overviewOpenErrorsSub
    } = elements;
    let lastPayload = null;
    let pendingRequest = null;
    const mediaJobFilters = {
      jobType: 'all',
      status: 'all',
      days: 30
    };

    function humanBytes(value) {
      const n = Math.max(0, Number(value) || 0);
      if (n < 1024) return `${n} B`;
      const units = ['KB', 'MB', 'GB', 'TB'];
      let size = n / 1024;
      let idx = 0;
      while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
      }
      return `${size.toFixed(1)} ${units[idx]}`;
    }

    function renderAssetTracking(data = {}) {
      const totals = data.totals || {};
      if (overviewActiveAssets) overviewActiveAssets.textContent = String(totals.total_active || 0);
      if (overviewTotalAssets) overviewTotalAssets.textContent = `${t('overview_total_assets')}: ${totals.total_all || 0}`;
    }

    function renderHealth(health = {}) {
      if (!ffmpegHealth) return;
      const ffmpegLine = `<div class="${health.ffmpegOk ? 'health-ok' : 'health-bad'}">${health.ffmpegOk ? t('ffmpeg_ok') : t('ffmpeg_fail')} ${health.ffmpegInfo ? `| ${health.ffmpegInfo}` : ''}</div>`;
      const ffprobeLine = `<div class="${health.ffprobeOk ? 'health-ok' : 'health-bad'}">${health.ffprobeOk ? t('ffprobe_ok') : t('ffprobe_fail')} ${health.ffprobeInfo ? `| ${health.ffprobeInfo}` : ''}</div>`;
      ffmpegHealth.innerHTML = `${ffmpegLine}${ffprobeLine}`;
    }

    function jobStatusLabel(status) {
      const normalized = String(status || '').trim().toLowerCase();
      if (normalized === 'running') return t('health_job_status_running');
      if (normalized === 'queued') return t('health_job_status_queued');
      if (normalized === 'completed') return t('health_job_status_completed');
      if (normalized === 'failed') return t('health_job_status_failed');
      if (normalized === 'cancelled') return t('health_job_status_cancelled');
      return normalized || '-';
    }

    function jobTypeLabel(type) {
      const normalized = String(type || '').trim().toLowerCase();
      if (normalized === 'subtitle') return t('health_subtitle_jobs');
      if (normalized === 'video_ocr') return t('health_ocr_jobs');
      return normalized || '-';
    }

    function jobPhaseLabel(phase) {
      const normalized = String(phase || '').trim().toLowerCase();
      const known = new Set([
        'queued', 'preparing', 'preparing_audio', 'model_loading', 'transcribing', 'aligning',
        'writing_subtitles', 'sampling_frames', 'model_ready', 'recognizing_frames', 'saving',
        'loading_asset', 'summarizing_document', 'generating_metadata', 'saving_metadata',
        'completed', 'failed', 'cancelled', 'interrupted'
      ]);
      return known.has(normalized) ? t(`health_job_phase_${normalized}`) : (normalized || '-');
    }

    function renderFilterOption(value, label, selected) {
      return `<option value="${escapeHtml(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }

    function renderMediaJobColumnFilter(key) {
      const selectedValue = key === 'jobType' ? mediaJobFilters.jobType : mediaJobFilters.status;
      const triggerLabel = selectedValue === 'all'
        ? (key === 'jobType' ? t('health_job_type_short') : t('health_job_status'))
        : (key === 'jobType' ? jobTypeLabel(selectedValue) : jobStatusLabel(selectedValue));
      if (key === 'jobType') {
        return `<details class="media-job-filter-menu">
          <summary aria-label="${escapeHtml(t('health_job_type'))}">${escapeHtml(triggerLabel)}</summary>
          <div class="media-job-filter-options">
            ${[
              ['all', t('health_job_filter_all_types')],
              ['subtitle', t('health_subtitle_jobs')],
              ['video_ocr', t('health_ocr_jobs')]
            ].map(([value, label]) => `<button type="button" class="mediaJobFilterOption${selectedValue === value ? ' is-selected' : ''}" data-filter-key="jobType" data-filter-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join('')}
          </div>
        </details>`;
      }
      return `<details class="media-job-filter-menu">
        <summary aria-label="${escapeHtml(t('health_job_status'))}">${escapeHtml(triggerLabel)}</summary>
        <div class="media-job-filter-options">
          ${[
            ['all', t('health_job_filter_all_statuses')],
            ['running', t('health_job_status_running')],
            ['queued', t('health_job_status_queued')],
            ['completed', t('health_job_status_completed')],
            ['failed', t('health_job_status_failed')],
            ['cancelled', t('health_job_status_cancelled')]
          ].map(([value, label]) => `<button type="button" class="mediaJobFilterOption${selectedValue === value ? ' is-selected' : ''}" data-filter-key="status" data-filter-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </details>`;
    }

    function renderMediaJobsTable(jobs = []) {
      const rows = Array.isArray(jobs) ? jobs : [];
      return `
        <div class="media-jobs-table-wrap">
          <table class="media-jobs-table">
            <thead><tr>
              <th><div class="media-job-column-filter">${renderMediaJobColumnFilter('jobType')}</div></th>
              <th>${escapeHtml(t('health_job_asset'))}</th>
              <th><div class="media-job-column-filter">${renderMediaJobColumnFilter('status')}</div></th>
              <th>${escapeHtml(t('health_job_phase'))}</th>
              <th>${escapeHtml(t('health_job_progress'))}</th>
              <th>${escapeHtml(t('health_job_started'))}</th>
              <th>${escapeHtml(t('health_job_finished'))}</th>
              <th>${escapeHtml(t('actions'))}</th>
            </tr></thead>
            <tbody>${rows.length ? rows.map((job) => {
              const status = String(job.status || '').trim().toLowerCase();
              const badgeClass = status === 'completed' ? 'health-ok' : ['failed', 'cancelled'].includes(status) ? 'health-bad' : 'health-warn';
              const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
              const message = String(job.error || job.warning || '').trim();
              return `<tr data-media-job-id="${escapeHtml(job.jobId || '')}">
                <td>${escapeHtml(jobTypeLabel(job.jobType))}</td>
                <td><strong>${escapeHtml(job.assetTitle || '-')}</strong>${message ? `<small title="${escapeHtml(message)}">${escapeHtml(message)}</small>` : ''}</td>
                <td><span class="${badgeClass}">${escapeHtml(jobStatusLabel(status))}</span></td>
                <td>${escapeHtml(jobPhaseLabel(job.progressPhase))}</td>
                <td><div class="media-job-progress"><span style="width:${progress}%"></span></div><small>${progress}%</small></td>
                <td>${escapeHtml(formatDateTime(job.startedAt || job.createdAt))}</td>
                <td>${escapeHtml(formatDateTime(job.finishedAt))}</td>
                <td>${job.cancelable ? `<button type="button" class="danger mediaJobCancelBtn" data-job-id="${escapeHtml(job.jobId || '')}">${escapeHtml(t('health_job_cancel'))}</button>` : '-'}</td>
              </tr>`;
            }).join('') : `<tr class="media-jobs-empty-row"><td colspan="8">${escapeHtml(t('health_job_filter_empty'))}</td></tr>`}</tbody>
          </table>
        </div>
      `;
    }

    function filterMediaJobs(jobs = []) {
      const cutoffMs = Date.now() - (Math.max(1, Number(mediaJobFilters.days) || 30) * 24 * 60 * 60 * 1000);
      return (Array.isArray(jobs) ? jobs : []).filter((job) => {
        const jobType = String(job.jobType || '').trim().toLowerCase();
        const status = String(job.status || '').trim().toLowerCase();
        if (mediaJobFilters.jobType !== 'all' && jobType !== mediaJobFilters.jobType) return false;
        if (mediaJobFilters.status !== 'all' && status !== mediaJobFilters.status) return false;
        const timestamp = Date.parse(String(job.updatedAt || job.finishedAt || job.startedAt || job.createdAt || ''));
        return !Number.isFinite(timestamp) || timestamp >= cutoffMs;
      });
    }

    function renderMediaJobFilters() {
      return `
        <div class="media-job-filters">
          <select data-media-job-filter="days" aria-label="${escapeHtml(t('health_job_filter_period'))}">
            ${[1, 5, 10, 20, 30].map((days) => renderFilterOption(String(days), t('health_recent_jobs_window').replace('{days}', String(days)), String(mediaJobFilters.days))).join('')}
          </select>
        </div>
      `;
    }

    function positionMediaJobFilterMenu(details) {
      if (!details?.open) return;
      const summary = details.querySelector?.('summary');
      const options = details.querySelector?.('.media-job-filter-options');
      const rect = summary?.getBoundingClientRect?.();
      if (!options || !rect) return;
      const viewportWidth = Math.max(320, Number(global.innerWidth) || 0);
      const viewportHeight = Math.max(320, Number(global.innerHeight) || 0);
      const menuWidth = Math.max(174, Math.round(rect.width));
      const left = Math.max(8, Math.min(rect.left, viewportWidth - menuWidth - 8));
      options.style.left = `${Math.round(left)}px`;
      options.style.top = `${Math.round(rect.bottom + 4)}px`;
      options.style.minWidth = `${menuWidth}px`;
      global.requestAnimationFrame?.(() => {
        const menuRect = options.getBoundingClientRect?.();
        if (!menuRect || menuRect.bottom <= viewportHeight - 8) return;
        const aboveTop = rect.top - menuRect.height - 4;
        if (aboveTop >= 8) options.style.top = `${Math.round(aboveTop)}px`;
      });
    }

    function renderSystemJobSlot(titleKey, job, type) {
      if (!job) {
        return `
          <div class="system-job-slot is-empty">
            <div class="system-job-slot-title">${escapeHtml(t(titleKey))}</div>
            <div class="system-job-empty">${escapeHtml(t('health_job_idle'))}</div>
          </div>
        `;
      }
      const status = String(job.status || '').trim().toLowerCase();
      const badgeClass = status === 'completed' ? 'health-ok' : status === 'failed' ? 'health-bad' : 'health-warn';
      const typeIsSubtitle = type === 'subtitle';
      const details = [
        [t('health_job_asset'), job.assetTitle || '-'],
        [typeIsSubtitle ? t('health_job_label') : t('health_job_engine'), typeIsSubtitle ? (job.label || '-') : (job.engine || '-')],
        [typeIsSubtitle ? t('health_job_model') : t('health_job_segments'), typeIsSubtitle ? (job.model || '-') : String(job.segmentCount || 0)],
        [t('health_job_updated'), formatDateTime(job.updatedAt)],
        [t('health_job_finished'), formatDateTime(job.finishedAt)],
        [t('health_job_progress'), `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%`]
      ];
      if (!typeIsSubtitle) {
        details.splice(3, 0, [t('health_job_lines'), String(job.lineCount || 0)]);
      }
      const warningText = String(job.warning || '').trim();
      const errorText = String(job.error || '').trim();
      return `
        <div class="system-job-slot">
          <div class="system-job-slot-head">
            <div class="system-job-slot-title">${escapeHtml(t(titleKey))}</div>
            <span class="${badgeClass}">${escapeHtml(jobStatusLabel(status))}</span>
          </div>
          <div class="system-job-name">${escapeHtml(job.assetTitle || '-')}</div>
          <div class="system-job-details">
            ${details.map(([label, value]) => `<div class="system-job-detail"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || '-')}</span></div>`).join('')}
            ${warningText ? `<div class="system-job-detail"><strong>${escapeHtml(t('health_job_warning'))}</strong><span>${escapeHtml(warningText)}</span></div>` : ''}
            ${errorText ? `<div class="system-job-detail"><strong>${escapeHtml(t('health_job_error'))}</strong><span>${escapeHtml(errorText)}</span></div>` : ''}
          </div>
        </div>
      `;
    }

    function renderSystemJobGroup(titleKey, group, type) {
      return `
        <section class="system-job-card">
          <h3>${escapeHtml(t(titleKey))}</h3>
          <div class="system-job-card-body">
            ${renderSystemJobSlot('health_job_running_now', group?.active || null, type)}
            ${renderSystemJobSlot('health_job_latest_done', group?.latestCompleted || null, type)}
            ${renderSystemJobSlot('health_job_latest_failed', group?.latestFailed || null, type)}
          </div>
        </section>
      `;
    }

    function renderSystemHealth(data = {}) {
      if (!systemHealthRows) return;
      const disk = data.disk || {};
      const jobs = data.jobs || {};
      const services = data.services || {};
      const integrity = data.integrity || {};
      const recent = data.recentJobs || {};
      const mediaJobs = Array.isArray(data.mediaJobs) ? data.mediaJobs : [];
      const serviceEntries = [
        ['health_service_app', services.app],
        ['health_service_postgres', services.postgres],
        ['health_service_elastic', services.elasticsearch],
        ['health_service_keycloak', services.keycloak],
        ['health_service_oauth2_proxy', services.oauth2Proxy]
      ];
      const serviceList = serviceEntries.map(([, entry]) => entry);
      const upServices = serviceList.filter((entry) => Boolean(entry?.ok)).length;
      const failedJobs = Number(jobs.proxyFailed || 0) + Number(jobs.subtitleFailed || 0) + Number(jobs.ocrFailed || 0);
      if (overviewSystemHealth) overviewSystemHealth.textContent = upServices === serviceList.length ? 'OK' : `${upServices}/${serviceList.length}`;
      if (overviewSystemHealthSub) overviewSystemHealthSub.textContent = `${upServices}/${serviceList.length} ${t('overview_uptime')}`;
      if (overviewOpenErrors) overviewOpenErrors.textContent = String(failedJobs);
      if (overviewOpenErrorsSub) overviewOpenErrorsSub.textContent = `${t('overview_failed_jobs')}: ${failedJobs}`;
      const serviceBadge = (entry) => {
        const ok = Boolean(entry?.ok);
        const status = Number(entry?.status || 0);
        const cls = ok ? 'health-ok' : 'health-bad';
        const label = ok ? t('health_up') : t('health_down');
        const suffix = status > 0 ? ` (${status})` : '';
        return `<span class="${cls}">${escapeHtml(label)}${escapeHtml(suffix)}</span>`;
      };
      const serviceCards = serviceEntries.map(([labelKey, entry]) => `
        <div class="health-service-card ${entry?.ok ? 'is-up' : 'is-down'}">
          <strong>${escapeHtml(t(labelKey))}</strong>
          ${serviceBadge(entry)}
        </div>
      `).join('');
      systemHealthRows.innerHTML = [
        `<div class="row"><strong>${escapeHtml(t('health_disk'))}</strong><span>${escapeHtml(t('health_uploads_size'))}: ${escapeHtml(humanBytes(disk.uploadsBytes))} | ${escapeHtml(t('health_uploads_files'))}: ${escapeHtml(String(disk.uploadsFiles || 0))} | ${escapeHtml(t('health_fs_free'))}: ${escapeHtml(humanBytes(disk.fsFreeBytes))} / ${escapeHtml(t('health_fs_total'))}: ${escapeHtml(humanBytes(disk.fsTotalBytes))}</span></div>`,
        `<div class="row health-services-row" data-health-section="services"><strong>${escapeHtml(t('health_services'))}</strong><div class="health-service-list">${serviceCards}</div></div>`,
        `<div class="row"><strong>${escapeHtml(t('health_jobs'))}</strong><span>${escapeHtml(t('health_proxy_running'))}: ${escapeHtml(String(jobs.proxyRunning || 0))} | ${escapeHtml(t('health_subtitle_running'))}: ${escapeHtml(String(jobs.subtitleRunning || 0))} | ${escapeHtml(t('health_ocr_running'))}: ${escapeHtml(String(jobs.ocrRunning || 0))} | ${escapeHtml(t('health_proxy_failed'))}: ${escapeHtml(String(jobs.proxyFailed || 0))} | ${escapeHtml(t('health_subtitle_failed'))}: ${escapeHtml(String(jobs.subtitleFailed || 0))} | ${escapeHtml(t('health_ocr_failed'))}: ${escapeHtml(String(jobs.ocrFailed || 0))}</span></div>`,
        `<div class="row"><strong>${escapeHtml(t('health_integrity'))}</strong><span>${escapeHtml(t('health_missing_proxy'))}: ${escapeHtml(String(integrity.missingProxy || 0))} | ${escapeHtml(t('health_missing_thumbnail'))}: ${escapeHtml(String(integrity.missingThumbnail || 0))} | ${escapeHtml(t('health_missing_subtitle'))}: ${escapeHtml(String(integrity.missingSubtitle || 0))} | ${escapeHtml(t('health_missing_ocr'))}: ${escapeHtml(String(integrity.missingOcr || 0))}</span></div>`
      ].join('');
      if (systemJobStatus) {
        const filteredMediaJobs = filterMediaJobs(mediaJobs);
        systemJobStatus.innerHTML = `
          <div class="system-job-status-head">
            <div class="system-job-status-title">
              <h3>${escapeHtml(t('health_recent_jobs'))}</h3>
              <button type="button" class="mediaJobsRefreshBtn" title="${escapeHtml(t('health_job_refresh'))}" aria-label="${escapeHtml(t('health_job_refresh'))}">&#8635;</button>
            </div>
            ${renderMediaJobFilters()}
          </div>
          ${renderMediaJobsTable(filteredMediaJobs)}
        `;
      }
    }

    systemJobStatus?.addEventListener?.('change', (event) => {
      const select = event.target?.closest?.('[data-media-job-filter]');
      if (!select) return;
      const key = String(select.dataset.mediaJobFilter || '');
      if (key === 'days') mediaJobFilters.days = Math.max(1, Math.min(30, Number(select.value) || 30));
      else if (key === 'jobType' || key === 'status') mediaJobFilters[key] = String(select.value || 'all');
      renderSystemHealth(lastPayload?.systemHealth || {});
    });

    systemJobStatus?.addEventListener?.('toggle', (event) => {
      const details = event.target?.closest?.('details.media-job-filter-menu');
      if (!details?.open) return;
      systemJobStatus.querySelectorAll?.('details.media-job-filter-menu[open]').forEach((item) => {
        if (item !== details) item.removeAttribute('open');
      });
      positionMediaJobFilterMenu(details);
    }, true);

    systemJobStatus?.addEventListener?.('click', async (event) => {
      const filterOption = event.target?.closest?.('.mediaJobFilterOption');
      if (filterOption) {
        const key = String(filterOption.dataset.filterKey || '');
        const value = String(filterOption.dataset.filterValue || 'all');
        if (key === 'jobType' || key === 'status') mediaJobFilters[key] = value;
        filterOption.closest?.('details')?.removeAttribute?.('open');
        renderSystemHealth(lastPayload?.systemHealth || {});
        return;
      }
      const refreshButton = event.target?.closest?.('.mediaJobsRefreshBtn');
      if (refreshButton) {
        refreshButton.disabled = true;
        clear();
        await refresh({ force: true, forceServer: true }).catch((error) => {
          global.alert?.(`${t('health_job_refresh_failed')}: ${String(error?.message || 'Request failed')}`);
        });
        return;
      }
      const button = event.target?.closest?.('.mediaJobCancelBtn');
      if (!button) return;
      const jobId = String(button.dataset.jobId || '').trim();
      if (!jobId || !global.confirm(t('health_job_cancel_confirm'))) return;
      button.disabled = true;
      try {
        await api(`/api/admin/media-jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
        clear();
        await refresh({ force: true });
      } catch (error) {
        button.disabled = false;
        global.alert?.(`${t('health_job_cancel_failed')}: ${String(error?.message || 'Request failed')}`);
      }
    });

    function render(payload) {
      if (!payload) return;
      renderAssetTracking(payload.tracking);
      renderHealth(payload.health);
      renderSystemHealth(payload.systemHealth);
      if (payload.diagnostics && typeof renderRuntimeDiagnostics === 'function') {
        renderRuntimeDiagnostics(payload.diagnostics);
      }
    }

    async function refresh(options = {}) {
      const force = options.force !== false;
      if (!force && lastPayload) {
        render(lastPayload);
        return lastPayload;
      }
      if (pendingRequest) return pendingRequest;

      const request = Promise.all([
        api('/api/admin/workflow-tracking'),
        api('/api/admin/ffmpeg-health'),
        api(`/api/admin/system-health${options.forceServer ? '?refresh=1' : ''}`),
        api('/api/admin/runtime-diagnostics?limit=100').catch(() => null)
      ]).then(([tracking, health, systemHealth, diagnostics]) => {
        lastPayload = { tracking, health, systemHealth, diagnostics };
        render(lastPayload);
        return lastPayload;
      });
      pendingRequest = request;
      try {
        return await request;
      } finally {
        if (pendingRequest === request) pendingRequest = null;
      }
    }

    function rerender() {
      render(lastPayload);
    }

    function clear() {
      lastPayload = null;
      pendingRequest = null;
    }

    return { refresh, rerender, clear, renderSystemHealth };
  }

  global.createAdminSystemHealthModule = createAdminSystemHealthModule;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createAdminSystemHealthModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
