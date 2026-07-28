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
      return normalized || '-';
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
      const typeIsMetadata = type === 'metadata';
      const details = [
        [t('health_job_asset'), job.assetTitle || '-'],
        [typeIsMetadata ? t('health_job_model') : typeIsSubtitle ? t('health_job_label') : t('health_job_engine'), typeIsMetadata ? (job.model || '-') : typeIsSubtitle ? (job.label || '-') : (job.engine || '-')],
        [typeIsMetadata ? t('health_job_chunks') : typeIsSubtitle ? t('health_job_model') : t('health_job_segments'), typeIsMetadata ? String(job.chunkCount || 0) : typeIsSubtitle ? (job.model || '-') : String(job.segmentCount || 0)],
        [t('health_job_updated'), formatDateTime(job.updatedAt)],
        [t('health_job_finished'), formatDateTime(job.finishedAt)],
        [t('health_job_progress'), `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%`]
      ];
      if (!typeIsSubtitle && !typeIsMetadata) {
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
      const mediaJobRetentionDays = Math.max(1, Number(data.mediaJobRetentionDays) || 30);
      const serviceEntries = [
        ['health_service_app', services.app],
        ['health_service_postgres', services.postgres],
        ['health_service_elastic', services.elasticsearch],
        ['health_service_keycloak', services.keycloak],
        ['health_service_oauth2_proxy', services.oauth2Proxy]
      ];
      const serviceList = serviceEntries.map(([, entry]) => entry);
      const upServices = serviceList.filter((entry) => Boolean(entry?.ok)).length;
      const failedJobs = Number(jobs.proxyFailed || 0) + Number(jobs.subtitleFailed || 0) + Number(jobs.ocrFailed || 0) + Number(jobs.metadataFailed || 0);
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
        `<div class="row"><strong>${escapeHtml(t('health_jobs'))}</strong><span>${escapeHtml(t('health_proxy_running'))}: ${escapeHtml(String(jobs.proxyRunning || 0))} | ${escapeHtml(t('health_subtitle_running'))}: ${escapeHtml(String(jobs.subtitleRunning || 0))} | ${escapeHtml(t('health_ocr_running'))}: ${escapeHtml(String(jobs.ocrRunning || 0))} | ${escapeHtml(t('health_metadata_running'))}: ${escapeHtml(String(jobs.metadataRunning || 0))} | ${escapeHtml(t('health_proxy_failed'))}: ${escapeHtml(String(jobs.proxyFailed || 0))} | ${escapeHtml(t('health_subtitle_failed'))}: ${escapeHtml(String(jobs.subtitleFailed || 0))} | ${escapeHtml(t('health_ocr_failed'))}: ${escapeHtml(String(jobs.ocrFailed || 0))} | ${escapeHtml(t('health_metadata_failed'))}: ${escapeHtml(String(jobs.metadataFailed || 0))}</span></div>`,
        `<div class="row"><strong>${escapeHtml(t('health_integrity'))}</strong><span>${escapeHtml(t('health_missing_proxy'))}: ${escapeHtml(String(integrity.missingProxy || 0))} | ${escapeHtml(t('health_missing_thumbnail'))}: ${escapeHtml(String(integrity.missingThumbnail || 0))} | ${escapeHtml(t('health_missing_subtitle'))}: ${escapeHtml(String(integrity.missingSubtitle || 0))} | ${escapeHtml(t('health_missing_ocr'))}: ${escapeHtml(String(integrity.missingOcr || 0))}</span></div>`
      ].join('');
      if (systemJobStatus) {
        const windowLabel = t('health_recent_jobs_window').replace('{days}', String(mediaJobRetentionDays));
        systemJobStatus.innerHTML = `
          <div class="system-job-status-head">
            <h3>${escapeHtml(t('health_recent_jobs'))}</h3>
            <span>${escapeHtml(windowLabel)}</span>
          </div>
          <div class="system-job-grid">
            ${renderSystemJobGroup('health_subtitle_jobs', recent.subtitle || {}, 'subtitle')}
            ${renderSystemJobGroup('health_ocr_jobs', recent.ocr || {}, 'ocr')}
            ${renderSystemJobGroup('health_metadata_jobs', recent.metadata || {}, 'metadata')}
          </div>
        `;
      }
    }

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
        api('/api/admin/system-health'),
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
