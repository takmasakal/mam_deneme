const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

function registerAdminRoutes(app, deps) {
  const {
    pool,
    WORKFLOW,
    proxyJobs,
    subtitleJobs,
    videoOcrJobs,
    metadataEnrichmentService,
    requireScopedAdminAccess,
    publicUploadUrlToAbsolutePath,
    reloadLearnedTurkishCorrectionsFromDb,
    getLearnedTurkishCorrectionsList,
    normalizeLearnedCorrectionKey,
    learnedTurkishCorrections,
    turkishWordSet,
    sanitizeVideoOcrItems,
    normalizeOcrEngine,
    getCandidateOcrFilePathsForRow,
    sanitizeSubtitleItems,
    normalizeSubtitleLang,
    findSubtitleMatchesInText,
    resolveEffectivePermissions,
    getUserPermissionsSettings,
    fetchKeycloakUsers,
    fetchKeycloakGroups,
    fetchKeycloakGroupMembers,
    isVisibleKeycloakUser,
    fetchKeycloakUserPermissionDefaults,
    resolvePermissionKeysFromPrincipals,
    normalizePermissionEntry,
    PERMISSION_KEYS,
    getPermissionDefinitionsPayload,
    saveUserPermissionsSettings,
    getAdminSettings,
    saveAdminSettings,
    normalizeBackupSettings,
    runSystemBackup,
    listBackupFiles,
    getRuntimeErrorLogs,
    getActiveUsers,
    normalizePlayerUiMode,
    normalizeNewAssetDefaultVisibility,
    normalizeSubtitleStyle,
    normalizeAuditRetentionDays,
    normalizeMediaJobRetentionDays,
    normalizeAuthSessionSettings,
    applyKeycloakAuthSessionSettings,
    cleanupAuditEvents,
    cleanupMediaProcessingJobs,
    recordAuditEvent,
    generateApiToken,
    systemHealthCache,
    SYSTEM_HEALTH_CACHE_TTL_MS,
    normalizeMediaJobType,
    normalizeMediaJobStatus,
    mapSubtitleJobFromDbRow,
    mapVideoOcrJobFromDbRow,
    cancelMediaJobRuntime,
    hasActiveMediaJobRuntime,
    OCR_DIR,
    UPLOADS_DIR,
    normalizeVttContent,
    resolveStoredUrl,
    pickLatestVideoOcrUrlFromDc,
    runCommandCapture,
    backfillElasticIndex,
    createProxyJob,
    runProxyJob,
    queryAssetSuggestions,
    suggestAssetIdsElastic,
    hasStoredFile,
    collectAssetCleanupPaths,
    cleanupAssetFiles,
    cleanupUnreferencedAssetFiles,
    deleteAssetFromElastic,
    removeAssetFromCollections,
    ensureVideoProxyAndThumbnail,
    isVideoCandidate,
    computeBufferSha256,
    getAssetStoredFileHash,
    findDuplicateAssetByHash,
    buildDuplicateAssetPayload,
    sanitizeFileName,
    inferMimeTypeFromFileName,
    inferAssetType,
    getIngestStoragePath,
    resolveAssetInputPath,
    buildArtifactPath,
    generateVideoThumbnail,
    regenerateVideoThumbnailForAsset,
    ensurePdfThumbnailForRow,
    isPdfCandidate,
    isOfficeDocumentCandidate,
    isDocumentCandidate,
    ensureDocumentThumbnailForRow,
    imageDerivativeService,
    extractPreviewContentFromFile,
    indexAssetToElastic,
    mapAssetRow,
    buildOcrDisplayLabel,
    syncOcrSegmentIndexForAsset,
    syncSubtitleCueIndexForAssetRow,
    formatTimecode,
    getAssetFamily,
    assetAccessService,
    assetEditLockService,
    hasDocumentRightsAdminAccess,
    nanoid: providedNanoid,
    removeAssetFromElastic
  } = deps;
  const resolvedNanoid = typeof providedNanoid === 'function' ? providedNanoid : nanoid;

  function resolveSubtitleFilePath(subtitleUrl) {
    const filePath = publicUploadUrlToAbsolutePath(String(subtitleUrl || '').trim());
    if (!filePath) return '';
    const resolvedPath = path.resolve(filePath);
    const uploadsRoot = path.resolve(UPLOADS_DIR);
    if (resolvedPath !== uploadsRoot && !resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) return '';
    if (!resolvedPath.split(path.sep).includes('subtitles')) return '';
    return resolvedPath;
  }

  function resolveOcrFilePath(ocrUrl) {
    const filePath = publicUploadUrlToAbsolutePath(String(ocrUrl || '').trim());
    if (!filePath) return '';
    const resolvedPath = path.resolve(filePath);
    const uploadsRoot = path.resolve(UPLOADS_DIR);
    if (resolvedPath !== uploadsRoot && !resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) return '';
    if (!resolvedPath.split(path.sep).includes('ocr')) return '';
    return resolvedPath;
  }

  async function cleanupReplacedUploadUrls(assetId, publicUrls = [], cleanupOptions = {}) {
    if (typeof cleanupUnreferencedAssetFiles !== 'function') return;
    const targets = Array.from(new Set(
      (Array.isArray(publicUrls) ? publicUrls : [publicUrls])
        .map((url) => publicUploadUrlToAbsolutePath(String(url || '').trim()))
        .filter(Boolean)
    ));
    if (!targets.length) return;
    await cleanupUnreferencedAssetFiles(targets, { assetId: String(assetId || '').trim(), ...cleanupOptions });
  }

  function isImageAssetRow(row = {}) {
    return getAssetFamily({
      mimeType: row.mime_type,
      fileName: row.file_name,
      declaredType: row.type
    }) === 'image';
  }

  async function ensureImagePreviewAndThumbnailForRow(row = {}) {
    if (!imageDerivativeService) throw new Error('Image derivative service is unavailable');
    if (!isImageAssetRow(row)) throw new Error('Image derivative generation is supported only for image assets');
    const inputPath = resolveAssetInputPath(row);
    if (!inputPath || !fs.existsSync(inputPath)) {
      const err = new Error('Source file not found');
      err.statusCode = 404;
      throw err;
    }
    const derivatives = await imageDerivativeService.ensureImageDerivativesForUpload({
      mimeType: row.mime_type,
      fileName: row.file_name,
      inputPath,
      createdAt: row.created_at || new Date()
    });
    const previousProxyUrl = resolveStoredUrl(row.proxy_url, 'proxies');
    const previousThumbnailUrl = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
    const nowIso = new Date().toISOString();
    const updated = await pool.query(
      `
        UPDATE assets
        SET proxy_url = $2,
            proxy_status = 'ready',
            thumbnail_url = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING *
      `,
      [
        row.id,
        String(derivatives.proxyUrl || '').trim(),
        String(derivatives.thumbnailUrl || '').trim(),
        nowIso
      ]
    );
    const nextRow = updated.rows?.[0] || row;
    await cleanupReplacedUploadUrls(row.id, previousProxyUrl);
    await cleanupReplacedUploadUrls(row.id, previousThumbnailUrl, { ignoreSameAssetVersionRefs: true });
    return {
      row: nextRow,
      previewUrl: resolveStoredUrl(nextRow.proxy_url, 'proxies'),
      thumbnailUrl: resolveStoredUrl(nextRow.thumbnail_url, 'thumbnails')
    };
  }

  async function regenerateImageThumbnailForRow(row = {}) {
    if (!imageDerivativeService) throw new Error('Image derivative service is unavailable');
    if (!isImageAssetRow(row)) throw new Error('Image thumbnail generation is supported only for image assets');
    return ensureImagePreviewAndThumbnailForRow(row);
  }
app.use('/api/admin', requireScopedAdminAccess);

async function requireSuperAdminRequest(req, res) {
	    const effective = await resolveEffectivePermissions(req);
  if (!effective?.isSuperAdmin) {
    res.status(403).json({ error: 'Super admin permission is required' });
    return null;
  }
	  return effective;
	}

async function requireAssetRightsAdminRequest(req, res) {
  const context = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
  if (!context?.canManageAllAssetVisibility && !assetAccessService.hasScopedAssetRightsAdminAccess(context)) {
    res.status(403).json({ error: 'Admin permission is required' });
    return null;
  }
  return context;
}

const DOCUMENT_RIGHTS_USER_GROUPS = String(process.env.MAM_DOCUMENT_USER_GROUPS || 'dokkullan,dokadmin,dokyonet,dokyönet,dokyon,dokyön')
  .split(',')
  .map((value) => String(value || '').trim())
  .filter(Boolean);

function normalizeDocumentIdentity(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

function documentUserCandidates(user = {}) {
  const username = String(user?.username || '').trim();
  const email = String(user?.email || '').trim();
  const firstName = String(user?.firstName || '').trim();
  const lastName = String(user?.lastName || '').trim();
  const localEmail = email.includes('@') ? email.split('@')[0] : '';
  return [username, email, localEmail, `${firstName} ${lastName}`.trim()]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

async function requireDocumentRightsAdminRequest(req, res) {
  const effective = await resolveEffectivePermissions(req);
  const context = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
  const allowed = typeof hasDocumentRightsAdminAccess === 'function'
    ? hasDocumentRightsAdminAccess(effective, context)
    : Boolean(effective?.isSuperAdmin || effective?.canAccessAdmin);
  if (!allowed) {
    res.status(403).json({ error: 'Document rights admin permission is required' });
    return null;
  }
  return { effective, context };
}

async function requireTextAdminRequest(req, res) {
  const effective = await resolveEffectivePermissions(req);
  const context = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
  const allowed = Boolean(
    effective?.isSuperAdmin
    || effective?.canAccessAdmin
    || effective?.canAccessTextAdmin
    || assetAccessService.hasScopedAdminScopeAccess(context, 'text-admin')
  );
  if (!allowed) {
    res.status(403).json({ error: 'Text admin permission is required' });
    return null;
  }
  return { effective, context };
}

function canTextAdminViewAsset(row, gate = {}) {
  if (gate?.effective?.isSuperAdmin || gate?.effective?.canAccessAdmin) return true;
  return assetAccessService.canViewAsset(row, gate.context || {});
}

function appendTextAdminAssetAccessWhere(where, values, gate = {}, alias = 'assets') {
  where.push(`${alias}.deleted_at IS NULL`);
  if (gate?.effective?.isSuperAdmin || gate?.effective?.canAccessAdmin) {
    return;
  }
  assetAccessService.appendAssetAccessWhere(where, values, gate.context || {}, alias);
}

function getDocumentRightsVisibilityContext(gate = {}) {
  if (gate?.effective?.isSuperAdmin) return gate.context || {};
  return {
    ...(gate.context || {}),
    canBypassAssetTypeAccess: false,
    canManageAllAssetVisibility: false,
    canViewHiddenAssets: true
  };
}

async function collectDocumentEligibleUsers() {
  const data = typeof fetchKeycloakGroupMembers === 'function'
    ? await fetchKeycloakGroupMembers(DOCUMENT_RIGHTS_USER_GROUPS, { maxPerGroup: 1000 })
    : { users: [] };
  const users = (Array.isArray(data?.users) ? data.users : [])
    .filter((user) => (typeof isVisibleKeycloakUser === 'function' ? isVisibleKeycloakUser(user) : true));
  const allowed = new Set();
  users.forEach((user) => {
    documentUserCandidates(user).forEach((candidate) => {
      const key = normalizeDocumentIdentity(candidate);
      if (key) allowed.add(key);
    });
  });
  return { users, allowed };
}

function normalizeDocumentUserList(values) {
  return assetAccessService.normalizeAccessList(values || []);
}

function validateDocumentUserLists(payload, allowedUserKeys) {
  const fields = [
    'allowedUsers',
    'deniedUsers',
    'editAllowedUsers',
    'editDeniedUsers',
    'downloadAllowedUsers',
    'downloadDeniedUsers'
  ];
  const normalized = {};
  const invalid = [];
  fields.forEach((field) => {
    const list = normalizeDocumentUserList(payload?.[field]);
    normalized[field] = list;
    list.forEach((value) => {
      const key = normalizeDocumentIdentity(value);
      if (!key || !allowedUserKeys.has(key)) invalid.push(value);
    });
  });
  return { normalized, invalid: Array.from(new Set(invalid)) };
}

const DOCUMENT_ASSET_SQL = `(
  LOWER(COALESCE(assets.type, '')) IN ('document', 'documents', 'pdf', 'office', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx')
  OR LOWER(COALESCE(assets.mime_type, '')) IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation'
  )
  OR LOWER(COALESCE(assets.file_name, '')) ~ '\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$'
)`;

function mapTypeAccessPayload(row) {
  return {
    typeGroup: row.typeGroup,
    visibility: row.visibility || 'public',
    ownerGroups: row.ownerGroups || [],
    allowedUsers: row.allowedUsers || [],
    allowedGroups: row.allowedGroups || [],
    deniedUsers: row.deniedUsers || [],
    deniedGroups: row.deniedGroups || [],
    editAllowedUsers: row.editAllowedUsers || [],
    editAllowedGroups: row.editAllowedGroups || [],
    editDeniedUsers: row.editDeniedUsers || [],
    editDeniedGroups: row.editDeniedGroups || [],
    downloadAllowedUsers: row.downloadAllowedUsers || [],
    downloadAllowedGroups: row.downloadAllowedGroups || [],
    downloadDeniedUsers: row.downloadDeniedUsers || [],
    downloadDeniedGroups: row.downloadDeniedGroups || [],
    uploadAllowedUsers: row.uploadAllowedUsers || [],
    uploadAllowedGroups: row.uploadAllowedGroups || [],
    uploadDeniedUsers: row.uploadDeniedUsers || [],
    uploadDeniedGroups: row.uploadDeniedGroups || [],
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy || ''
  };
}

function limitGroupsForAssetRightsAdmin(values, context) {
  const list = assetAccessService.normalizeAccessList(values || []);
  if (context?.canManageAllAssetVisibility) return list;
  const managed = assetAccessService.getManagedGroupsForScope(context, 'asset-rights');
  return list.filter((group) => managed.includes(group));
}

async function requireFullAdminRequest(req, res) {
  const effective = await resolveEffectivePermissions(req);
  if (!effective?.canAccessAdmin) {
    res.status(403).json({ error: 'Admin permission is required' });
    return null;
  }
  return effective;
}

async function collectMamAccessGroups() {
  const result = await pool.query(
    `
      SELECT DISTINCT group_name
      FROM (
        SELECT unnest(owner_groups) AS group_name FROM assets WHERE cardinality(owner_groups) > 0
        UNION ALL
        SELECT unnest(allowed_groups) AS group_name FROM assets WHERE cardinality(allowed_groups) > 0
	        UNION ALL
	        SELECT group_name FROM group_admins
	        UNION ALL
        SELECT unnest(download_allowed_groups) AS group_name FROM assets WHERE cardinality(download_allowed_groups) > 0
	        UNION ALL
	        SELECT unnest(edit_allowed_groups) AS group_name FROM assets WHERE cardinality(edit_allowed_groups) > 0
	        UNION ALL
	        SELECT unnest(download_denied_groups) AS group_name FROM assets WHERE cardinality(download_denied_groups) > 0
	        UNION ALL
	        SELECT unnest(owner_groups) AS group_name FROM asset_type_access WHERE cardinality(owner_groups) > 0
	        UNION ALL
	        SELECT unnest(allowed_groups) AS group_name FROM asset_type_access WHERE cardinality(allowed_groups) > 0
	        UNION ALL
	        SELECT unnest(edit_allowed_groups) AS group_name FROM asset_type_access WHERE cardinality(edit_allowed_groups) > 0
	        UNION ALL
	        SELECT unnest(download_allowed_groups) AS group_name FROM asset_type_access WHERE cardinality(download_allowed_groups) > 0
	        UNION ALL
	        SELECT unnest(upload_allowed_groups) AS group_name FROM asset_type_access WHERE cardinality(upload_allowed_groups) > 0
	      ) groups
      WHERE group_name IS NOT NULL AND group_name <> ''
      ORDER BY group_name ASC
    `
  );
  return result.rows.map((row) => String(row.group_name || '').trim()).filter(Boolean);
}

app.get('/api/admin/identity/overview', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const userQ = String(req.query.userQ || req.query.q || '').trim();
    const shouldSearchUsers = userQ.length >= 2;
    const [kcData, kcGroupsData, mamGroups, groupAdminsResult] = await Promise.all([
      shouldSearchUsers ? fetchKeycloakUsers({ search: userQ, max: 100 }) : Promise.resolve({ users: [], realmByUsername: new Map() }),
      typeof fetchKeycloakGroups === 'function' ? fetchKeycloakGroups() : Promise.resolve({ groups: [] }),
      collectMamAccessGroups(),
      pool.query(
        `
          SELECT id, group_name, username, admin_scopes, asset_type_groups, created_at, created_by
          FROM group_admins
          ORDER BY group_name ASC, username ASC
        `
      )
    ]);
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    const permissionDefaultsByUser = await fetchKeycloakUserPermissionDefaults(kcUsers, kcData?.realmByUsername);
    const users = kcUsers
      .map((user) => {
        const username = String(user?.username || '').trim().toLowerCase();
        const defaults = permissionDefaultsByUser.get(username) || [];
        return {
          id: String(user?.id || '').trim(),
          username,
          displayName: [user?.firstName, user?.lastName].map((item) => String(item || '').trim()).filter(Boolean).join(' '),
          email: String(user?.email || '').trim(),
          enabled: user?.enabled !== false,
          realm: String(kcData?.realmByUsername?.get(username) || '').trim(),
          permissionKeys: defaults
        };
      })
      .filter((row) => row.username)
      .sort((a, b) => a.username.localeCompare(b.username));
    const groups = Array.isArray(kcGroupsData?.groups) ? kcGroupsData.groups : [];
    const keycloakGroupNames = new Set(
      groups.flatMap((group) => [group.name, group.path]).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    );
    const mamOnlyGroups = mamGroups.filter((group) => !keycloakGroupNames.has(group.toLowerCase()));
    return res.json({
      source: users.length || groups.length ? 'keycloak' : 'empty',
      userQuery: shouldSearchUsers ? userQ : '',
      users,
      groups,
      mamGroups,
      mamOnlyGroups,
      groupAdmins: groupAdminsResult.rows.map((row) => ({
        id: row.id,
        groupName: row.group_name,
        username: row.username,
        adminScopes: row.admin_scopes || [],
        assetTypeGroups: row.asset_type_groups || [],
        createdAt: row.created_at,
        createdBy: row.created_by || ''
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load identity overview' });
  }
});

app.get('/api/admin/group-admins', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const result = await pool.query(
      `
        SELECT id, group_name, username, admin_scopes, asset_type_groups, created_at, created_by
        FROM group_admins
        ORDER BY group_name ASC, username ASC
      `
    );
    return res.json({
      groupAdmins: result.rows.map((row) => ({
        id: row.id,
        groupName: row.group_name,
        username: row.username,
        adminScopes: row.admin_scopes || [],
        assetTypeGroups: row.asset_type_groups || [],
        createdAt: row.created_at,
        createdBy: row.created_by || ''
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load group admins' });
  }
});

app.post('/api/admin/group-admins', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const groupName = assetAccessService.normalizeAccessName(req.body?.groupName || req.body?.group || '');
    const username = assetAccessService.normalizeAccessName(req.body?.username || req.body?.user || '');
    const adminScopes = assetAccessService.normalizeAdminScopeList(req.body?.adminScopes || req.body?.admin_scopes, ['asset-rights']);
    const assetTypeGroups = assetAccessService.normalizeAssetTypeGroupList(req.body?.assetTypeGroups || req.body?.asset_type_groups, []);
    if (!groupName || !username) {
      return res.status(400).json({ error: 'groupName and username are required' });
    }
    const now = new Date().toISOString();
    const createdBy = String(effective.username || effective.displayName || '').trim();
    const result = await pool.query(
      `
        INSERT INTO group_admins (id, group_name, username, admin_scopes, asset_type_groups, created_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_name, username)
        DO UPDATE SET admin_scopes = EXCLUDED.admin_scopes,
                      asset_type_groups = EXCLUDED.asset_type_groups,
                      created_by = EXCLUDED.created_by
        RETURNING *
      `,
      [resolvedNanoid(), groupName, username, adminScopes, assetTypeGroups, now, createdBy]
    );
    await recordAuditEvent?.(req, {
      action: 'group_admin.saved',
      targetType: 'group_admin',
      targetId: result.rows[0].id,
      targetTitle: `${groupName}:${username}`,
      details: { groupName, username, adminScopes, assetTypeGroups }
    });
    return res.status(201).json({ groupAdmin: result.rows[0] });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save group admin' });
  }
});

app.patch('/api/admin/group-admins/:id', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const groupName = assetAccessService.normalizeAccessName(req.body?.groupName || req.body?.group || '');
    const username = assetAccessService.normalizeAccessName(req.body?.username || req.body?.user || '');
    const adminScopes = assetAccessService.normalizeAdminScopeList(req.body?.adminScopes || req.body?.admin_scopes, ['asset-rights']);
    const assetTypeGroups = assetAccessService.normalizeAssetTypeGroupList(req.body?.assetTypeGroups || req.body?.asset_type_groups, []);
    if (!groupName || !username) {
      return res.status(400).json({ error: 'groupName and username are required' });
    }
    const result = await pool.query(
      `
        UPDATE group_admins
        SET group_name = $2,
            username = $3,
            admin_scopes = $4,
            asset_type_groups = $5,
            created_by = $6
        WHERE id = $1
        RETURNING *
      `,
      [
        req.params.id,
        groupName,
        username,
        adminScopes,
        assetTypeGroups,
        String(effective.username || effective.displayName || '').trim()
      ]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Group admin not found' });
    await recordAuditEvent?.(req, {
      action: 'group_admin.updated',
      targetType: 'group_admin',
      targetId: result.rows[0].id,
      targetTitle: `${groupName}:${username}`,
      details: { groupName, username, adminScopes, assetTypeGroups }
    });
    return res.json({ groupAdmin: result.rows[0] });
  } catch (error) {
    if (String(error?.code || '') === '23505') {
      return res.status(409).json({ error: 'Group admin already exists' });
    }
    return res.status(500).json({ error: 'Failed to update group admin' });
  }
});

app.delete('/api/admin/group-admins/:id', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const result = await pool.query('DELETE FROM group_admins WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Group admin not found' });
    await recordAuditEvent?.(req, {
      action: 'group_admin.deleted',
      targetType: 'group_admin',
      targetId: result.rows[0].id,
      targetTitle: `${result.rows[0].group_name}:${result.rows[0].username}`,
      details: { groupName: result.rows[0].group_name, username: result.rows[0].username }
    });
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete group admin' });
  }
});

app.get('/api/admin/document-rights/assets', async (req, res) => {
  try {
    const gate = await requireDocumentRightsAdminRequest(req, res);
    if (!gate) return null;
    const q = String(req.query.q || '').trim();
    const requestedPage = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const requestedLimit = Number.parseInt(String(req.query.limit || '20'), 10) || 20;
    const limit = [20, 50, 100].includes(requestedLimit) ? requestedLimit : 20;
    const lockedOnly = ['1', 'true', 'yes', 'on'].includes(String(req.query.lockedOnly || '').trim().toLowerCase());
    const values = [];
    const where = ['assets.deleted_at IS NULL', DOCUMENT_ASSET_SQL];
    const visibilityContext = getDocumentRightsVisibilityContext(gate);
    assetAccessService.appendAssetAccessWhere(where, values, visibilityContext, 'assets');
    if (q) {
      values.push(`%${q.toLowerCase()}%`);
      where.push(`(
        LOWER(COALESCE(assets.title, '')) LIKE $${values.length}
        OR LOWER(COALESCE(assets.file_name, '')) LIKE $${values.length}
        OR LOWER(COALESCE(assets.id, '')) LIKE $${values.length}
      )`);
    }
    if (lockedOnly) {
      where.push(`EXISTS (
        SELECT 1
        FROM asset_edit_locks document_locks
        WHERE document_locks.asset_id = assets.id
          AND document_locks.expires_at > NOW()
      )`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM assets ${whereSql}`, values);
    const total = Number(countResult.rows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * limit;
    const pageValues = [...values, limit, offset];
    const result = await pool.query(
      `
        SELECT
          assets.id, assets.title, assets.file_name, assets.owner, assets.type,
          assets.allowed_users, assets.denied_users,
          assets.edit_allowed_users, assets.edit_denied_users,
          assets.download_allowed_users, assets.download_denied_users,
          assets.updated_at,
          asset_edit_locks.locked_by,
          asset_edit_locks.locked_by_name,
          asset_edit_locks.purpose AS lock_purpose,
          asset_edit_locks.created_at AS lock_created_at,
          asset_edit_locks.expires_at AS lock_expires_at
        FROM assets
        LEFT JOIN asset_edit_locks
          ON asset_edit_locks.asset_id = assets.id
         AND asset_edit_locks.expires_at > NOW()
        ${whereSql}
        ORDER BY LOWER(COALESCE(NULLIF(assets.title, ''), assets.file_name, assets.id)) ASC
        LIMIT $${pageValues.length - 1}
        OFFSET $${pageValues.length}
      `,
      pageValues
    );
    return res.json({
      assets: result.rows.map((row) => ({
        id: row.id,
        title: row.title || row.file_name || row.id,
        fileName: row.file_name || '',
        owner: row.owner || '',
        allowedUsers: row.allowed_users || [],
        deniedUsers: row.denied_users || [],
        editAllowedUsers: row.edit_allowed_users || [],
        editDeniedUsers: row.edit_denied_users || [],
        downloadAllowedUsers: row.download_allowed_users || [],
        downloadDeniedUsers: row.download_denied_users || [],
        editLock: row.locked_by ? {
          lockedBy: row.locked_by || '',
          lockedByName: row.locked_by_name || row.locked_by || '',
          purpose: row.lock_purpose || '',
          lockedAt: row.lock_created_at,
          expiresAt: row.lock_expires_at
        } : null,
        updatedAt: row.updated_at
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load document rights rows' });
  }
});

app.patch('/api/admin/document-rights/assets/:id/access', async (req, res) => {
  try {
    const gate = await requireDocumentRightsAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });
    const forbiddenFields = [
      'visibility',
      'ownerGroups',
      'allowedGroups',
      'deniedGroups',
      'editAllowedGroups',
      'editDeniedGroups',
      'downloadAllowedGroups',
      'downloadDeniedGroups',
      'uploadAllowedUsers',
      'uploadAllowedGroups',
      'uploadDeniedUsers',
      'uploadDeniedGroups'
    ].filter((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));
    if (forbiddenFields.length) {
      return res.status(400).json({ error: 'Document rights only accepts user fields', fields: forbiddenFields });
    }
    const assetResult = await pool.query(`SELECT * FROM assets WHERE id = $1 AND ${DOCUMENT_ASSET_SQL}`, [assetId]);
    const assetRow = assetResult.rows?.[0] || null;
    if (!assetRow) return res.status(404).json({ error: 'Document asset not found' });
    const visibilityContext = getDocumentRightsVisibilityContext(gate);
    if (!assetAccessService.canViewAsset(assetRow, visibilityContext)) {
      return res.status(404).json({ error: 'Document asset not found' });
    }
    const { allowed } = await collectDocumentEligibleUsers();
    if (!allowed.size) return res.status(400).json({ error: 'No eligible document users were found' });
    const { normalized, invalid } = validateDocumentUserLists(req.body || {}, allowed);
    if (invalid.length) {
      return res.status(400).json({ error: 'Only document users can be assigned', invalidUsers: invalid });
    }
    const result = await assetAccessService.updateAssetVisibility(assetId, normalized, {
      ...gate.context,
      canManageAllAssetVisibility: true
    });
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }
    await indexAssetToElastic(assetId).catch(() => {});
    await recordAuditEvent?.(req, {
      action: 'asset.document_rights_updated',
      targetType: 'asset',
      targetId: assetId,
      targetTitle: String(assetRow.title || assetRow.file_name || assetId),
      details: {
        source: 'document_rights_panel',
        allowedUsers: normalized.allowedUsers,
        deniedUsers: normalized.deniedUsers,
        editAllowedUsers: normalized.editAllowedUsers,
        editDeniedUsers: normalized.editDeniedUsers,
        downloadAllowedUsers: normalized.downloadAllowedUsers,
        downloadDeniedUsers: normalized.downloadDeniedUsers
      }
    });
    return res.json({
      asset: {
        id: result.row.id,
        title: result.row.title || result.row.file_name || result.row.id,
        allowedUsers: result.row.allowed_users || [],
        deniedUsers: result.row.denied_users || [],
        editAllowedUsers: result.row.edit_allowed_users || [],
        editDeniedUsers: result.row.edit_denied_users || [],
        downloadAllowedUsers: result.row.download_allowed_users || [],
        downloadDeniedUsers: result.row.download_denied_users || []
      }
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update document rights' });
  }
});

app.delete('/api/admin/document-rights/assets/:id/edit-lock', async (req, res) => {
  try {
    const gate = await requireDocumentRightsAdminRequest(req, res);
    if (!gate) return null;
    if (!assetEditLockService) return res.status(503).json({ error: 'Edit lock service is not available' });
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });
    const assetResult = await pool.query(`SELECT * FROM assets WHERE id = $1 AND ${DOCUMENT_ASSET_SQL}`, [assetId]);
    const assetRow = assetResult.rows?.[0] || null;
    if (!assetRow) return res.status(404).json({ error: 'Document asset not found' });
    const visibilityContext = getDocumentRightsVisibilityContext(gate);
    if (!assetAccessService.canViewAsset(assetRow, visibilityContext)) {
      return res.status(404).json({ error: 'Document asset not found' });
    }
    const result = await assetEditLockService.releaseAsset(assetId);
    await recordAuditEvent?.(req, {
      action: 'asset.edit_lock_released',
      targetType: 'asset',
      targetId: assetId,
      targetTitle: String(assetRow.title || assetRow.file_name || assetId),
      details: {
        source: 'document_rights_panel',
        forced: true,
        released: Boolean(result.released),
        lock: result.lock || null
      }
    });
    return res.json({ released: Boolean(result.released), lock: result.lock || null });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to release edit lock' });
  }
});

app.get('/api/admin/assets/access', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const requestedTypeGroups = (Array.isArray(req.query.typeGroup) ? req.query.typeGroup : [req.query.typeGroup])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => ['video', 'audio', 'photo', 'document', 'other'].includes(item));
    const visibility = String(req.query.visibility || '').trim().toLowerCase();
    const ownerGroupFilter = assetAccessService.normalizeAccessName(req.query.ownerGroup || req.query.owner_group || '');
    const lockedOnly = ['1', 'true', 'yes', 'on'].includes(String(req.query.lockedOnly || '').trim().toLowerCase());
    const limit = Number(req.query.limit) === 50 ? 50 : 20;
    const requestedPage = Math.max(1, Number(req.query.page) || 1);
    const values = [];
    const where = [];
    if (q) {
      values.push(`%${q}%`);
      where.push(`(LOWER(title) LIKE $${values.length} OR LOWER(file_name) LIKE $${values.length} OR LOWER(owner) LIKE $${values.length})`);
    }
    if (requestedTypeGroups.length) {
      const typeConditions = [];
      if (requestedTypeGroups.includes('video')) {
        typeConditions.push(`(LOWER(COALESCE(type, '')) = 'video' OR LOWER(COALESCE(mime_type, '')) LIKE 'video/%')`);
      }
      if (requestedTypeGroups.includes('audio')) {
        typeConditions.push(`(LOWER(COALESCE(type, '')) IN ('audio', 'sound') OR LOWER(COALESCE(mime_type, '')) LIKE 'audio/%')`);
      }
      if (requestedTypeGroups.includes('photo')) {
        typeConditions.push(`(
          LOWER(COALESCE(type, '')) IN ('photo', 'image', 'picture')
          OR LOWER(COALESCE(mime_type, '')) LIKE 'image/%'
          OR LOWER(COALESCE(file_name, '')) ~ '\\.(jpg|jpeg|png|gif|webp|tif|tiff|bmp|heic|heif)$'
        )`);
      }
      if (requestedTypeGroups.includes('document')) {
        typeConditions.push(`(
          LOWER(COALESCE(type, '')) IN ('document', 'pdf', 'office', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx')
          OR LOWER(COALESCE(mime_type, '')) IN (
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          )
          OR LOWER(COALESCE(file_name, '')) ~ '\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$'
        )`);
      }
      if (requestedTypeGroups.includes('other')) {
        typeConditions.push(`NOT (
          LOWER(COALESCE(type, '')) IN ('video', 'audio', 'sound', 'document', 'pdf', 'office', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx')
          OR LOWER(COALESCE(mime_type, '')) LIKE 'video/%'
          OR LOWER(COALESCE(mime_type, '')) LIKE 'audio/%'
          OR LOWER(COALESCE(type, '')) IN ('photo', 'image', 'picture')
          OR LOWER(COALESCE(mime_type, '')) LIKE 'image/%'
          OR LOWER(COALESCE(mime_type, '')) IN (
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          )
          OR LOWER(COALESCE(file_name, '')) ~ '\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|jpg|jpeg|png|gif|webp|tif|tiff|bmp|heic|heif)$'
        )`);
      }
      if (typeConditions.length) where.push(`(${typeConditions.join(' OR ')})`);
    }
    if (['private', 'group', 'groups', 'public'].includes(visibility)) {
      values.push(visibility);
      where.push(`COALESCE(visibility, 'public') = $${values.length}`);
    }
    if (ownerGroupFilter) {
      values.push([ownerGroupFilter]);
      where.push(`COALESCE(owner_groups, '{}') && $${values.length}::text[]`);
    }
	    if (lockedOnly) {
      where.push(`EXISTS (
        SELECT 1
        FROM asset_edit_locks
        WHERE asset_edit_locks.asset_id = assets.id
          AND asset_edit_locks.expires_at > NOW()
      )`);
	    }
	    const accessContext = await requireAssetRightsAdminRequest(req, res);
	    if (!accessContext) return null;
	    assetAccessService.appendManageableAssetAccessWhere(where, values, accessContext, 'assets');
	    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM assets ${whereSql}`, values);
    const total = Number(countResult.rows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * limit;
    const pageValues = [...values, limit, offset];
    const result = await pool.query(
      `
        SELECT
          assets.id, assets.title, assets.file_name, assets.owner, assets.type, assets.visibility, assets.owner_user, assets.owner_groups,
	          assets.allowed_users, assets.allowed_groups, assets.denied_users, assets.denied_groups,
	          assets.edit_allowed_users, assets.edit_allowed_groups, assets.edit_denied_users, assets.edit_denied_groups,
	          assets.download_allowed_users, assets.download_allowed_groups, assets.download_denied_users, assets.download_denied_groups,
	          assets.deleted_at, assets.updated_at,
          asset_edit_locks.locked_by,
          asset_edit_locks.locked_by_name,
          asset_edit_locks.purpose AS lock_purpose,
          asset_edit_locks.created_at AS lock_created_at,
          asset_edit_locks.expires_at AS lock_expires_at
        FROM assets
        LEFT JOIN asset_edit_locks
          ON asset_edit_locks.asset_id = assets.id
         AND asset_edit_locks.expires_at > NOW()
        ${whereSql}
        ORDER BY assets.updated_at DESC
        LIMIT $${pageValues.length - 1}
        OFFSET $${pageValues.length}
      `,
      pageValues
    );
    return res.json({
      assets: result.rows.map((row) => ({
        id: row.id,
        title: row.title || row.file_name || row.id,
        fileName: row.file_name || '',
        owner: row.owner || '',
        type: row.type || '',
        visibility: row.visibility || 'public',
        ownerUser: row.owner_user || '',
        ownerGroups: row.owner_groups || [],
        allowedUsers: row.allowed_users || [],
        allowedGroups: row.allowed_groups || [],
        deniedUsers: row.denied_users || [],
        deniedGroups: row.denied_groups || [],
	        editAllowedUsers: row.edit_allowed_users || [],
	        editAllowedGroups: row.edit_allowed_groups || [],
	        editDeniedUsers: row.edit_denied_users || [],
	        editDeniedGroups: row.edit_denied_groups || [],
	        downloadAllowedUsers: row.download_allowed_users || [],
	        downloadAllowedGroups: row.download_allowed_groups || [],
	        downloadDeniedUsers: row.download_denied_users || [],
	        downloadDeniedGroups: row.download_denied_groups || [],
        inTrash: Boolean(row.deleted_at),
        editLock: row.locked_by ? {
          lockedBy: row.locked_by || '',
          lockedByName: row.locked_by_name || row.locked_by || '',
          purpose: row.lock_purpose || '',
          lockedAt: row.lock_created_at,
          expiresAt: row.lock_expires_at
        } : null,
        updatedAt: row.updated_at
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load asset access rows' });
  }
});

app.get('/api/admin/assets/access-groups', async (req, res) => {
  try {
    const accessContext = await requireAssetRightsAdminRequest(req, res);
    if (!accessContext) return null;
    const groupNames = accessContext.canManageAllAssetVisibility
      ? await collectMamAccessGroups()
      : assetAccessService.getManagedGroupsForScope(accessContext, 'asset-rights');
    return res.json({ groups: groupNames.map((name) => ({ name, path: `/${name}` })), mamGroups: groupNames });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load asset access groups' });
  }
});

app.delete('/api/admin/assets/:id/edit-lock', async (req, res) => {
  try {
	    const effective = await requireAssetRightsAdminRequest(req, res);
	    if (!effective) return null;
    if (!assetEditLockService) return res.status(503).json({ error: 'Edit lock service is not available' });
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });
    const assetResult = await pool.query('SELECT id, title, file_name FROM assets WHERE id = $1', [assetId]);
    const assetRow = assetResult.rows[0] || null;
    if (!assetRow) return res.status(404).json({ error: 'Asset not found' });
    const result = await assetEditLockService.releaseAsset(assetId);
    await recordAuditEvent?.(req, {
      action: 'asset.edit_lock_released',
      targetType: 'asset',
      targetId: assetId,
      targetTitle: String(assetRow.title || assetRow.file_name || assetId),
      details: {
        source: 'admin_rights_panel',
        forced: true,
        released: Boolean(result.released),
        lock: result.lock || null
      }
    });
    return res.json({ released: Boolean(result.released), lock: result.lock || null });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to release edit lock' });
  }
});

app.patch('/api/admin/assets/:id/access', async (req, res) => {
  try {
    const accessContext = await requireAssetRightsAdminRequest(req, res);
    if (!accessContext) return null;
    const result = await assetAccessService.updateAssetVisibility(req.params.id, req.body || {}, accessContext);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }
    await indexAssetToElastic(req.params.id).catch(() => {});
    await recordAuditEvent?.(req, {
      action: 'asset.visibility_updated',
      targetType: 'asset',
      targetId: result.row.id,
      targetTitle: result.row.title,
      details: {
        source: 'admin_rights_panel',
        visibility: result.row.visibility,
        allowedUsers: result.row.allowed_users || [],
        allowedGroups: result.row.allowed_groups || [],
        deniedUsers: result.row.denied_users || [],
        deniedGroups: result.row.denied_groups || [],
	        editAllowedUsers: result.row.edit_allowed_users || [],
	        editAllowedGroups: result.row.edit_allowed_groups || [],
	        editDeniedUsers: result.row.edit_denied_users || [],
	        editDeniedGroups: result.row.edit_denied_groups || [],
	        downloadAllowedUsers: result.row.download_allowed_users || [],
	        downloadAllowedGroups: result.row.download_allowed_groups || [],
	        downloadDeniedUsers: result.row.download_denied_users || [],
	        downloadDeniedGroups: result.row.download_denied_groups || []
      }
    });
    return res.json({
      asset: {
        id: result.row.id,
        title: result.row.title || result.row.file_name || result.row.id,
        visibility: result.row.visibility || 'public',
        ownerUser: result.row.owner_user || '',
        ownerGroups: result.row.owner_groups || [],
        allowedUsers: result.row.allowed_users || [],
        allowedGroups: result.row.allowed_groups || [],
        deniedUsers: result.row.denied_users || [],
        deniedGroups: result.row.denied_groups || [],
	        editAllowedUsers: result.row.edit_allowed_users || [],
	        editAllowedGroups: result.row.edit_allowed_groups || [],
	        editDeniedUsers: result.row.edit_denied_users || [],
	        editDeniedGroups: result.row.edit_denied_groups || [],
	        downloadAllowedUsers: result.row.download_allowed_users || [],
	        downloadAllowedGroups: result.row.download_allowed_groups || [],
	        downloadDeniedUsers: result.row.download_denied_users || [],
	        downloadDeniedGroups: result.row.download_denied_groups || []
	      }
	    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update asset access' });
  }
});

	app.get('/api/admin/asset-types/access', async (req, res) => {
	  try {
	    const accessContext = await requireAssetRightsAdminRequest(req, res);
	    if (!accessContext) return null;
	    if (!accessContext.canManageAllAssetVisibility) {
	      return res.status(403).json({ error: 'Forbidden' });
	    }
	    const rows = (await assetAccessService.getAssetTypeAccessRows())
	      .filter((row) => assetAccessService.canManageAssetTypeAccess(row, accessContext));
	    return res.json({
	      types: rows.map(mapTypeAccessPayload),
	      pagination: { page: 1, limit: 5, total: rows.length, totalPages: 1 }
	    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load asset type access rows' });
  }
});

app.patch('/api/admin/asset-types/:typeGroup/access', async (req, res) => {
  try {
	    const effective = await requireAssetRightsAdminRequest(req, res);
	    if (!effective) return null;
	    const typeGroup = assetAccessService.normalizeAssetTypeGroup(req.params.typeGroup || '');
	    if (!typeGroup) return res.status(400).json({ error: 'Invalid asset type group' });
	    const currentRows = await assetAccessService.getAssetTypeAccessRows();
	    const currentRow = currentRows.find((row) => row.typeGroup === typeGroup);
	    if (!effective.canManageAllAssetVisibility || !currentRow || !assetAccessService.canManageAssetTypeAccess(currentRow, effective)) {
	      return res.status(403).json({ error: 'Forbidden' });
	    }
	    const payload = req.body || {};
	    const actor = String(effective.displayName || effective.username || '').trim();
	    const next = {
	      visibility: assetAccessService.normalizeVisibility(payload.visibility, 'public'),
	      ownerGroups: limitGroupsForAssetRightsAdmin(payload.ownerGroups, effective),
	      allowedUsers: assetAccessService.normalizeAccessList(payload.allowedUsers),
	      allowedGroups: limitGroupsForAssetRightsAdmin(payload.allowedGroups, effective),
	      deniedUsers: assetAccessService.normalizeAccessList(payload.deniedUsers),
	      deniedGroups: limitGroupsForAssetRightsAdmin(payload.deniedGroups, effective),
	      editAllowedUsers: assetAccessService.normalizeAccessList(payload.editAllowedUsers),
	      editAllowedGroups: limitGroupsForAssetRightsAdmin(payload.editAllowedGroups, effective),
	      editDeniedUsers: assetAccessService.normalizeAccessList(payload.editDeniedUsers),
	      editDeniedGroups: limitGroupsForAssetRightsAdmin(payload.editDeniedGroups, effective),
	      downloadAllowedUsers: assetAccessService.normalizeAccessList(payload.downloadAllowedUsers),
	      downloadAllowedGroups: limitGroupsForAssetRightsAdmin(payload.downloadAllowedGroups, effective),
	      downloadDeniedUsers: assetAccessService.normalizeAccessList(payload.downloadDeniedUsers),
	      downloadDeniedGroups: limitGroupsForAssetRightsAdmin(payload.downloadDeniedGroups, effective),
	      uploadAllowedUsers: assetAccessService.normalizeAccessList(payload.uploadAllowedUsers),
	      uploadAllowedGroups: limitGroupsForAssetRightsAdmin(payload.uploadAllowedGroups, effective),
	      uploadDeniedUsers: assetAccessService.normalizeAccessList(payload.uploadDeniedUsers),
	      uploadDeniedGroups: limitGroupsForAssetRightsAdmin(payload.uploadDeniedGroups, effective)
	    };
	    const result = await pool.query(
      `
        INSERT INTO asset_type_access (
	          type_group, visibility, owner_groups, allowed_users, allowed_groups,
	          denied_users, denied_groups, edit_allowed_users, edit_allowed_groups,
	          edit_denied_users, edit_denied_groups,
	          download_allowed_users, download_allowed_groups, download_denied_users, download_denied_groups,
	          upload_allowed_users, upload_allowed_groups, upload_denied_users, upload_denied_groups,
	          updated_at, updated_by
	        )
	        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
	        ON CONFLICT (type_group) DO UPDATE
        SET visibility = EXCLUDED.visibility,
            owner_groups = EXCLUDED.owner_groups,
            allowed_users = EXCLUDED.allowed_users,
            allowed_groups = EXCLUDED.allowed_groups,
            denied_users = EXCLUDED.denied_users,
            denied_groups = EXCLUDED.denied_groups,
            edit_allowed_users = EXCLUDED.edit_allowed_users,
	            edit_allowed_groups = EXCLUDED.edit_allowed_groups,
	            edit_denied_users = EXCLUDED.edit_denied_users,
	            edit_denied_groups = EXCLUDED.edit_denied_groups,
	            download_allowed_users = EXCLUDED.download_allowed_users,
	            download_allowed_groups = EXCLUDED.download_allowed_groups,
	            download_denied_users = EXCLUDED.download_denied_users,
	            download_denied_groups = EXCLUDED.download_denied_groups,
	            upload_allowed_users = EXCLUDED.upload_allowed_users,
	            upload_allowed_groups = EXCLUDED.upload_allowed_groups,
	            upload_denied_users = EXCLUDED.upload_denied_users,
	            upload_denied_groups = EXCLUDED.upload_denied_groups,
	            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
        RETURNING *
      `,
      [
        typeGroup,
        next.visibility,
        next.ownerGroups,
        next.allowedUsers,
        next.allowedGroups,
        next.deniedUsers,
        next.deniedGroups,
        next.editAllowedUsers,
	        next.editAllowedGroups,
	        next.editDeniedUsers,
	        next.editDeniedGroups,
	        next.downloadAllowedUsers,
	        next.downloadAllowedGroups,
	        next.downloadDeniedUsers,
	        next.downloadDeniedGroups,
	        next.uploadAllowedUsers,
	        next.uploadAllowedGroups,
	        next.uploadDeniedUsers,
	        next.uploadDeniedGroups,
	        new Date().toISOString(),
	        actor
      ]
    );
    await recordAuditEvent?.(req, {
      action: 'asset_type.visibility_updated',
      targetType: 'asset_type',
      targetId: typeGroup,
      targetTitle: typeGroup,
      details: { source: 'admin_rights_panel', ...next }
    });
    const row = assetAccessService.getTypeAccessSnapshot(result.rows[0]);
	    return res.json({ type: mapTypeAccessPayload(row) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update asset type access' });
  }
});

const PERMISSION_EXPORT_SCHEMA = 'mam.permission-export';
const PERMISSION_EXPORT_VERSION = 1;
const ACCESS_ARRAY_FIELDS = [
  'owner_groups',
  'allowed_users',
  'allowed_groups',
  'denied_users',
  'denied_groups',
  'edit_allowed_users',
  'edit_allowed_groups',
  'edit_denied_users',
  'edit_denied_groups',
  'download_allowed_users',
  'download_allowed_groups',
  'download_denied_users',
  'download_denied_groups',
  'upload_allowed_users',
  'upload_allowed_groups',
  'upload_denied_users',
  'upload_denied_groups'
];
const ASSET_ACCESS_ARRAY_FIELDS = ACCESS_ARRAY_FIELDS.filter((field) => !field.startsWith('upload_'));
const TYPE_ACCESS_GROUPS = ['video', 'audio', 'photo', 'document', 'other'];

function permissionExportStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (num) => String(num).padStart(2, '0');
  return [
    safe.getFullYear(),
    pad(safe.getMonth() + 1),
    pad(safe.getDate()),
    pad(safe.getHours())
  ].join('_');
}

function sanitizePermissionExportFileName(value, fallback) {
  const raw = String(value || '').trim() || fallback;
  const withoutExt = raw.replace(/\.json$/i, '');
  const safe = withoutExt
    .normalize('NFKD')
    .replace(/[^\w.\-ığüşöçİĞÜŞÖÇ]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `${safe || fallback}.json`;
}

function sendPermissionExport(res, payload, requestedName, defaultSuffix) {
  const fallback = `${permissionExportStamp()}_${defaultSuffix}`;
  const fileName = sanitizePermissionExportFileName(requestedName, fallback);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  return res.send(`${JSON.stringify(payload, null, 2)}\n`);
}

function ensurePermissionImportPayload(payload, expectedKind) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Invalid import payload');
    error.statusCode = 400;
    throw error;
  }
  if (payload.schema !== PERMISSION_EXPORT_SCHEMA || payload.version !== PERMISSION_EXPORT_VERSION || payload.kind !== expectedKind) {
    const error = new Error('Import file does not match the selected permission type');
    error.statusCode = 400;
    throw error;
  }
  return payload;
}

function normalizeTypeAccessImportRow(row = {}) {
  const typeGroup = assetAccessService.normalizeAssetTypeGroup(row.type_group || row.typeGroup || '');
  if (!typeGroup || !TYPE_ACCESS_GROUPS.includes(typeGroup)) return null;
  const out = {
    type_group: typeGroup,
    visibility: assetAccessService.normalizeVisibility(row.visibility, 'public')
  };
  ACCESS_ARRAY_FIELDS.forEach((field) => {
    const camel = field.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    out[field] = assetAccessService.normalizeAccessList(row[field] || row[camel] || []);
  });
  return out;
}

function normalizeAssetAccessImportRow(row = {}) {
  const id = String(row.id || '').trim();
  if (!id) return null;
  const out = {
    id,
    visibility: assetAccessService.normalizeVisibility(row.visibility, 'public'),
    owner_user: assetAccessService.normalizeAccessName(row.owner_user || row.ownerUser || '')
  };
  ASSET_ACCESS_ARRAY_FIELDS.forEach((field) => {
    const camel = field.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    out[field] = assetAccessService.normalizeAccessList(row[field] || row[camel] || []);
  });
  return out;
}

function normalizeGroupAdminImportRow(row = {}) {
  const groupName = assetAccessService.normalizeAccessName(row.group_name || row.groupName || '');
  const username = assetAccessService.normalizeAccessName(row.username || '');
  if (!groupName || !username) return null;
  return {
    id: String(row.id || '').trim() || resolvedNanoid(),
    group_name: groupName,
    username,
    admin_scopes: assetAccessService.normalizeAdminScopeList(row.admin_scopes || row.adminScopes, ['asset-rights']),
    asset_type_groups: assetAccessService.normalizeAssetTypeGroupList(row.asset_type_groups || row.assetTypeGroups, []),
    created_at: row.created_at || row.createdAt || new Date().toISOString(),
    created_by: String(row.created_by || row.createdBy || 'import').trim() || 'import'
  };
}

app.get('/api/admin/permission-exports/:kind', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const kind = String(req.params.kind || '').trim();
    const exportedAt = new Date().toISOString();
    if (kind === 'asset-rights') {
      const [typeRows, assetRows] = await Promise.all([
        pool.query(`
          SELECT type_group, visibility, owner_groups, allowed_users, allowed_groups, denied_users, denied_groups,
                 edit_allowed_users, edit_allowed_groups, edit_denied_users, edit_denied_groups,
                 download_allowed_users, download_allowed_groups, download_denied_users, download_denied_groups,
                 upload_allowed_users, upload_allowed_groups, upload_denied_users, upload_denied_groups,
                 updated_at, updated_by
          FROM asset_type_access
          ORDER BY CASE type_group WHEN 'video' THEN 1 WHEN 'audio' THEN 2 WHEN 'photo' THEN 3 WHEN 'document' THEN 4 ELSE 5 END
        `),
        pool.query(`
          SELECT id, title, type, media_url, visibility, owner_user, owner_groups,
                 allowed_users, allowed_groups, denied_users, denied_groups,
                 edit_allowed_users, edit_allowed_groups, edit_denied_users, edit_denied_groups,
                 download_allowed_users, download_allowed_groups, download_denied_users, download_denied_groups,
                 updated_at
          FROM assets
          ORDER BY lower(COALESCE(title, '')), id
        `)
      ]);
      const payload = {
        schema: PERMISSION_EXPORT_SCHEMA,
        version: PERMISSION_EXPORT_VERSION,
        kind,
        exportedAt,
        exportedBy: effective.username || effective.displayName || '',
        assetTypeAccess: typeRows.rows,
        assetAccess: assetRows.rows
      };
      await recordAuditEvent?.(req, {
        action: 'permission_export.asset_rights',
        targetType: 'permission_export',
        targetId: kind,
        targetTitle: 'Asset rights export',
        details: { typeRows: typeRows.rowCount, assetRows: assetRows.rowCount }
      });
      return sendPermissionExport(res, payload, req.query.fileName, 'varlık_yetkileri');
    }
    if (kind === 'principal-rights') {
      const [userPermissions, groupAdmins, keycloakGroupsData] = await Promise.all([
        getUserPermissionsSettings(),
        pool.query('SELECT id, group_name, username, admin_scopes, asset_type_groups, created_at, created_by FROM group_admins ORDER BY group_name, username'),
        fetchKeycloakGroups()
      ]);
      const exportedUserPermissions = userPermissions?.users && typeof userPermissions.users === 'object' && !Array.isArray(userPermissions.users)
        ? userPermissions.users
        : {};
      const exportedGroupPermissions = userPermissions?.groups && typeof userPermissions.groups === 'object' && !Array.isArray(userPermissions.groups)
        ? userPermissions.groups
        : {};
      const exportedLegacyUserPermissions = Object.fromEntries(
        Object.entries(userPermissions || {}).filter(([key]) => !['users', 'groups'].includes(String(key || '').trim()))
      );
      const exportedUserPermissionEntries = { ...exportedLegacyUserPermissions, ...exportedUserPermissions };
      const groupNames = (Array.isArray(keycloakGroupsData?.groups) ? keycloakGroupsData.groups : [])
        .map((group) => String(group?.path || group?.name || '').trim())
        .filter(Boolean);
      const groupedUsersData = await fetchKeycloakGroupMembers(groupNames, { maxPerGroup: 1000 });
      const keycloakUsers = (Array.isArray(groupedUsersData?.users) ? groupedUsersData.users : [])
        .filter((user) => isVisibleKeycloakUser(user))
        .map((user) => {
          const username = String(user?.username || '').trim().toLowerCase();
          const savedPermissionOverride = exportedUserPermissionEntries?.[username] || null;
          return {
            id: String(user?.id || '').trim(),
            username,
            firstName: String(user?.firstName || '').trim(),
            lastName: String(user?.lastName || '').trim(),
            email: String(user?.email || '').trim(),
            enabled: user?.enabled !== false,
            realm: String(groupedUsersData?.realmByUsername?.get(username) || '').trim(),
            groups: Array.isArray(groupedUsersData?.groupPathsByUsername?.get(username))
              ? groupedUsersData.groupPathsByUsername.get(username)
              : [],
            hasSavedPermissionOverride: Boolean(savedPermissionOverride),
            savedPermissionOverride
          };
        })
        .filter((user) => user.username)
        .sort((a, b) => a.username.localeCompare(b.username));
      const keycloakGroups = (Array.isArray(keycloakGroupsData?.groups) ? keycloakGroupsData.groups : [])
        .map((group) => {
          const name = String(group?.name || '').trim();
          const path = String(group?.path || '').trim();
          const mapped = resolvePermissionKeysFromPrincipals({ groups: [name, path] });
          const normalizedName = assetAccessService.normalizeAccessName(path || name);
          const savedPermissionOverride = exportedGroupPermissions?.[normalizedName] || exportedGroupPermissions?.[assetAccessService.normalizeAccessName(name)] || null;
          return {
            id: String(group?.id || '').trim(),
            name,
            path,
            realm: String(group?.realm || '').trim(),
            permissionKeys: mapped.permissionKeys,
            hasSavedPermissionOverride: Boolean(savedPermissionOverride),
            savedPermissionOverride
          };
        })
        .filter((group) => group.name)
        .sort((a, b) => String(a.path || a.name).localeCompare(String(b.path || b.name)));
      const payload = {
        schema: PERMISSION_EXPORT_SCHEMA,
        version: PERMISSION_EXPORT_VERSION,
        kind,
        exportedAt,
        exportedBy: effective.username || effective.displayName || '',
        userPermissions,
        groupAdmins: groupAdmins.rows,
        keycloakUsers,
        keycloakGroups
      };
      await recordAuditEvent?.(req, {
        action: 'permission_export.principal_rights',
        targetType: 'permission_export',
        targetId: kind,
        targetTitle: 'User and group rights export',
        details: {
          userPermissionEntries: Object.keys(userPermissions || {}).length,
          groupAdmins: groupAdmins.rowCount,
          keycloakUsers: keycloakUsers.length,
          keycloakGroups: keycloakGroups.length
        }
      });
      return sendPermissionExport(res, payload, req.query.fileName, 'kullanıcı_grup_yetkileri');
    }
    return res.status(400).json({ error: 'Invalid permission export type' });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || 'Failed to export permissions') });
  }
});

app.post('/api/admin/permission-imports/:kind', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const kind = String(req.params.kind || '').trim();
    const payload = ensurePermissionImportPayload(req.body || {}, kind);
    const importedAt = new Date().toISOString();

    if (kind === 'asset-rights') {
      const typeRows = (Array.isArray(payload.assetTypeAccess) ? payload.assetTypeAccess : [])
        .map(normalizeTypeAccessImportRow)
        .filter(Boolean);
      const assetRows = (Array.isArray(payload.assetAccess) ? payload.assetAccess : [])
        .map(normalizeAssetAccessImportRow)
        .filter(Boolean);
      const missingAssetIds = [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of typeRows) {
          await client.query(
            `
              INSERT INTO asset_type_access (
                type_group, visibility, owner_groups, allowed_users, allowed_groups,
                denied_users, denied_groups, edit_allowed_users, edit_allowed_groups,
                edit_denied_users, edit_denied_groups,
                download_allowed_users, download_allowed_groups, download_denied_users, download_denied_groups,
                upload_allowed_users, upload_allowed_groups, upload_denied_users, upload_denied_groups,
                updated_at, updated_by
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
              ON CONFLICT (type_group) DO UPDATE
              SET visibility = EXCLUDED.visibility,
                  owner_groups = EXCLUDED.owner_groups,
                  allowed_users = EXCLUDED.allowed_users,
                  allowed_groups = EXCLUDED.allowed_groups,
                  denied_users = EXCLUDED.denied_users,
                  denied_groups = EXCLUDED.denied_groups,
                  edit_allowed_users = EXCLUDED.edit_allowed_users,
                  edit_allowed_groups = EXCLUDED.edit_allowed_groups,
                  edit_denied_users = EXCLUDED.edit_denied_users,
                  edit_denied_groups = EXCLUDED.edit_denied_groups,
                  download_allowed_users = EXCLUDED.download_allowed_users,
                  download_allowed_groups = EXCLUDED.download_allowed_groups,
                  download_denied_users = EXCLUDED.download_denied_users,
                  download_denied_groups = EXCLUDED.download_denied_groups,
                  upload_allowed_users = EXCLUDED.upload_allowed_users,
                  upload_allowed_groups = EXCLUDED.upload_allowed_groups,
                  upload_denied_users = EXCLUDED.upload_denied_users,
                  upload_denied_groups = EXCLUDED.upload_denied_groups,
                  updated_at = EXCLUDED.updated_at,
                  updated_by = EXCLUDED.updated_by
            `,
            [
              row.type_group,
              row.visibility,
              row.owner_groups,
              row.allowed_users,
              row.allowed_groups,
              row.denied_users,
              row.denied_groups,
              row.edit_allowed_users,
              row.edit_allowed_groups,
              row.edit_denied_users,
              row.edit_denied_groups,
              row.download_allowed_users,
              row.download_allowed_groups,
              row.download_denied_users,
              row.download_denied_groups,
              row.upload_allowed_users,
              row.upload_allowed_groups,
              row.upload_denied_users,
              row.upload_denied_groups,
              importedAt,
              effective.username || effective.displayName || 'import'
            ]
          );
        }
        let updatedAssets = 0;
        for (const row of assetRows) {
          const result = await client.query(
            `
              UPDATE assets
              SET visibility = $2,
                  owner_user = $3,
                  owner_groups = $4,
                  allowed_users = $5,
                  allowed_groups = $6,
                  denied_users = $7,
                  denied_groups = $8,
                  edit_allowed_users = $9,
                  edit_allowed_groups = $10,
                  edit_denied_users = $11,
                  edit_denied_groups = $12,
                  download_allowed_users = $13,
                  download_allowed_groups = $14,
                  download_denied_users = $15,
                  download_denied_groups = $16,
                  updated_at = NOW()
              WHERE id = $1
            `,
            [
              row.id,
              row.visibility,
              row.owner_user,
              row.owner_groups,
              row.allowed_users,
              row.allowed_groups,
              row.denied_users,
              row.denied_groups,
              row.edit_allowed_users,
              row.edit_allowed_groups,
              row.edit_denied_users,
              row.edit_denied_groups,
              row.download_allowed_users,
              row.download_allowed_groups,
              row.download_denied_users,
              row.download_denied_groups
            ]
          );
          if (result.rowCount) updatedAssets += 1;
          else missingAssetIds.push(row.id);
        }
        await client.query('COMMIT');
        await recordAuditEvent?.(req, {
          action: 'permission_import.asset_rights',
          targetType: 'permission_import',
          targetId: kind,
          targetTitle: 'Asset rights import',
          details: { typeRows: typeRows.length, updatedAssets, missingAssetIds }
        });
        return res.json({ ok: true, typeRows: typeRows.length, updatedAssets, missingAssetIds });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    if (kind === 'principal-rights') {
      const userPermissions = payload.userPermissions && typeof payload.userPermissions === 'object' && !Array.isArray(payload.userPermissions)
        ? payload.userPermissions
        : {};
      const groupAdmins = (Array.isArray(payload.groupAdmins) ? payload.groupAdmins : [])
        .map(normalizeGroupAdminImportRow)
        .filter(Boolean);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `
            INSERT INTO admin_settings (key, value, updated_at)
            VALUES ('user_permissions', $1::jsonb, $2)
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
          `,
          [JSON.stringify(userPermissions), importedAt]
        );
        await client.query('DELETE FROM group_admins');
        for (const row of groupAdmins) {
          await client.query(
            `
              INSERT INTO group_admins (id, group_name, username, admin_scopes, asset_type_groups, created_at, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (group_name, username)
              DO UPDATE SET admin_scopes = EXCLUDED.admin_scopes,
                            asset_type_groups = EXCLUDED.asset_type_groups,
                            created_at = EXCLUDED.created_at,
                            created_by = EXCLUDED.created_by
            `,
            [row.id, row.group_name, row.username, row.admin_scopes, row.asset_type_groups, row.created_at, row.created_by]
          );
        }
        await client.query('COMMIT');
        await recordAuditEvent?.(req, {
          action: 'permission_import.principal_rights',
          targetType: 'permission_import',
          targetId: kind,
          targetTitle: 'User and group rights import',
          details: { userPermissionEntries: Object.keys(userPermissions).length, groupAdmins: groupAdmins.length }
        });
        return res.json({ ok: true, userPermissionEntries: Object.keys(userPermissions).length, groupAdmins: groupAdmins.length });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    return res.status(400).json({ error: 'Invalid permission import type' });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: String(error?.message || 'Failed to import permissions') });
  }
});

app.get('/api/admin/turkish-corrections', async (_req, res) => {
  try {
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({
      entries: getLearnedTurkishCorrectionsList(),
      wordSetSize: turkishWordSet.size
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load Turkish corrections' });
  }
});

app.post('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const wrong = normalizeLearnedCorrectionKey(req.body?.wrong ?? req.body?.from ?? '');
    const correct = String(req.body?.correct ?? req.body?.to ?? '').trim();
    if (!wrong || !correct) {
      return res.status(400).json({ error: 'wrong and correct are required' });
    }
    const now = new Date().toISOString();
    await pool.query(
      `
        INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (wrong_key)
        DO UPDATE SET wrong = EXCLUDED.wrong, correct = EXCLUDED.correct, updated_at = EXCLUDED.updated_at
      `,
      [wrong, wrong, correct, now, now]
    );
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, entry: { wrong, correct }, total: learnedTurkishCorrections.size });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save Turkish correction' });
  }
});

app.put('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const sanitized = rows
      .map((row) => ({
        wrong: normalizeLearnedCorrectionKey(row?.wrong ?? row?.from ?? ''),
        correct: String(row?.correct ?? row?.to ?? '').trim()
      }))
      .filter((row) => row.wrong && row.correct);
    await pool.query('BEGIN');
    await pool.query('DELETE FROM learned_turkish_corrections');
    const now = new Date().toISOString();
    for (const row of sanitized) {
      await pool.query(
        `
          INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [row.wrong, row.wrong, row.correct, now, now]
      );
    }
    await pool.query('COMMIT');
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, total: learnedTurkishCorrections.size });
  } catch (_error) {
    await pool.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: 'Failed to replace Turkish corrections' });
  }
});

app.delete('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const wrong = normalizeLearnedCorrectionKey(req.body?.wrong ?? req.query?.wrong ?? '');
    if (!wrong) return res.status(400).json({ error: 'wrong is required' });
    const delRes = await pool.query(
      'DELETE FROM learned_turkish_corrections WHERE wrong_key = $1',
      [wrong]
    );
    const removed = Number(delRes.rowCount || 0) > 0;
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, removed, total: learnedTurkishCorrections.size });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete Turkish correction' });
  }
});

function getOcrItemsFromDc(dcMetadata = {}, fallbackDate = '') {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  let videoItems = sanitizeVideoOcrItems(dc.videoOcrItems).map((item) => ({
    ...item,
    ocrKind: 'video'
  }));
  if (!videoItems.length && String(dc.videoOcrUrl || '').trim()) {
    videoItems = [{
      id: '__legacy_active__',
      ocrUrl: String(dc.videoOcrUrl || '').trim(),
      ocrLabel: String(dc.videoOcrLabel || '').trim() || 'video-ocr',
      ocrEngine: normalizeOcrEngine(dc.videoOcrEngine || 'paddle'),
      lineCount: Math.max(0, Number(dc.videoOcrLineCount) || 0),
      segmentCount: Math.max(0, Number(dc.videoOcrSegmentCount) || 0),
      createdAt: String(fallbackDate || new Date().toISOString()),
      ocrKind: 'video'
    }];
  }
  let photoItems = sanitizeVideoOcrItems(dc.photoOcrItems).map((item) => ({
    ...item,
    ocrLabel: String(item.ocrLabel || '').trim() || 'photo-ocr',
    ocrKind: 'photo'
  }));
  if (!photoItems.length && String(dc.photoOcrUrl || '').trim()) {
    photoItems = [{
      id: '__legacy_photo_active__',
      ocrUrl: String(dc.photoOcrUrl || '').trim(),
      ocrLabel: String(dc.photoOcrLabel || '').trim() || 'photo-ocr',
      ocrEngine: normalizeOcrEngine(dc.photoOcrEngine || 'paddle'),
      lineCount: Math.max(0, Number(dc.photoOcrLineCount) || 0),
      segmentCount: Math.max(0, Number(dc.photoOcrSegmentCount) || 0),
      createdAt: String(fallbackDate || new Date().toISOString()),
      ocrKind: 'photo'
    }];
  }
  return [...videoItems, ...photoItems];
}

function getOcrKind(item = {}) {
  return String(item.ocrKind || '').trim().toLowerCase() === 'photo' ? 'photo' : 'video';
}

function stripOcrKindForStorage(item = {}) {
  const { ocrKind: _ocrKind, ...rest } = item || {};
  return rest;
}

function getOcrItemsForKind(dc = {}, kind = 'video') {
  const normalizedKind = kind === 'photo' ? 'photo' : 'video';
  const key = normalizedKind === 'photo' ? 'photoOcrItems' : 'videoOcrItems';
  const prefix = normalizedKind === 'photo' ? 'photoOcr' : 'videoOcr';
  let items = sanitizeVideoOcrItems(dc[key]).map((item) => ({
    ...item,
    ocrLabel: String(item.ocrLabel || '').trim() || (normalizedKind === 'photo' ? 'photo-ocr' : 'video-ocr'),
    ocrKind: normalizedKind
  }));
  const directUrl = String(dc[`${prefix}Url`] || '').trim();
  if (!items.length && directUrl) {
    items = [{
      id: normalizedKind === 'photo' ? '__legacy_photo_active__' : '__legacy_active__',
      ocrUrl: directUrl,
      ocrLabel: String(dc[`${prefix}Label`] || '').trim() || (normalizedKind === 'photo' ? 'photo-ocr' : 'video-ocr'),
      ocrEngine: normalizeOcrEngine(dc[`${prefix}Engine`] || 'paddle'),
      lineCount: Math.max(0, Number(dc[`${prefix}LineCount`]) || 0),
      segmentCount: Math.max(0, Number(dc[`${prefix}SegmentCount`]) || 0),
      createdAt: new Date().toISOString(),
      ocrKind: normalizedKind
    }];
  }
  return items;
}

function applyOcrKindToDc(dc = {}, kind = 'video', items = [], preferredActiveUrl = '') {
  const normalizedKind = kind === 'photo' ? 'photo' : 'video';
  const prefix = normalizedKind === 'photo' ? 'photoOcr' : 'videoOcr';
  const storedItems = sanitizeVideoOcrItems(items).map(stripOcrKindForStorage);
  const activeUrl = String(preferredActiveUrl || '').trim();
  let activeItem = activeUrl
    ? storedItems.find((it) => String(it.ocrUrl || '').trim() === activeUrl)
    : null;
  if (!activeItem && storedItems.length) activeItem = storedItems[storedItems.length - 1];
  return {
    ...dc,
    [`${prefix}Items`]: storedItems,
    [`${prefix}Url`]: activeItem ? String(activeItem.ocrUrl || '').trim() : '',
    [`${prefix}Label`]: activeItem ? String(activeItem.ocrLabel || '').trim() : '',
    [`${prefix}Engine`]: activeItem ? String(activeItem.ocrEngine || '').trim() : '',
    [`${prefix}LineCount`]: activeItem ? Math.max(0, Number(activeItem.lineCount) || 0) : 0,
    [`${prefix}SegmentCount`]: activeItem ? Math.max(0, Number(activeItem.segmentCount) || 0) : 0
  };
}

function ocrAbsolutePathToPublicUrl(absPath) {
  const safe = String(absPath || '');
  if (!safe) return '';
  const resolvedPath = path.resolve(safe);
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (resolvedPath !== uploadsRoot && !resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) return '';
  if (!resolvedPath.split(path.sep).includes('ocr')) return '';
  const rel = path.relative(UPLOADS_DIR, resolvedPath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return '';
  return `/uploads/${rel}`;
}

function resolveAdminOcrItemForAssetRow(row, itemId) {
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const items = getOcrItemsFromDc(dc, row?.updated_at || row?.created_at || '');
  const direct = items.find((it) => String(it.id || '') === String(itemId || ''));
  if (direct) return { item: direct, inferred: false };

  const rawId = String(itemId || '').trim();
  if (!rawId.startsWith('__inferred__')) return { item: null, inferred: false };
  const inferredName = rawId.slice('__inferred__'.length);
  if (!inferredName) return { item: null, inferred: true };

  const inferredPaths = getCandidateOcrFilePathsForRow(row);
  const matched = inferredPaths.find((p) => path.basename(String(p || '')) === inferredName);
  if (!matched) return { item: null, inferred: true };
  const inferredUrl = ocrAbsolutePathToPublicUrl(matched);
  if (!inferredUrl) return { item: null, inferred: true };
  return {
    item: {
      id: rawId,
      ocrUrl: inferredUrl,
      ocrLabel: path.basename(matched),
      ocrEngine: '',
      lineCount: 0,
      segmentCount: 0,
      createdAt: String(row?.updated_at || row?.created_at || new Date().toISOString()),
      ocrKind: isImageAssetRow(row) ? 'photo' : 'video'
    },
    inferred: true
  };
}

function getAdminRecordPagination(query = {}) {
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const page = Math.max(1, Number(query.page) || 1);
  return { limit, page };
}

function paginateAdminRecords(records = [], pagination = {}) {
  const list = Array.isArray(records) ? records : [];
  const limit = Math.max(1, Number(pagination.limit || 20));
  const requestedPage = Math.max(1, Number(pagination.page || 1));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * limit;
  return {
    records: list.slice(offset, offset + limit),
    pagination: { page, limit, total, totalPages }
  };
}

app.get('/api/admin/ocr-records', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const q = String(req.query.q || '').trim();
    const pagination = getAdminRecordPagination(req.query || {});
    const assetScanLimit = 5000;
    const params = [];
    const where = [];
    appendTextAdminAssetAccessWhere(where, params, gate, 'assets');
    if (q) {
      params.push(`%${q}%`);
      where.push(`(COALESCE(assets.title, '') ILIKE $${params.length} OR COALESCE(assets.file_name, '') ILIKE $${params.length})`);
    }
    params.push(assetScanLimit);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT assets.id, assets.title, assets.file_name, assets.type, assets.owner, assets.updated_at, assets.dc_metadata
        FROM assets
        ${whereSql}
        ORDER BY assets.updated_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    const records = [];
    result.rows.forEach((row) => {
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      let items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
      if (!items.length) {
        const inferredPaths = getCandidateOcrFilePathsForRow(row);
        if (inferredPaths.length) {
          const first = inferredPaths[0];
          const inferredUrl = ocrAbsolutePathToPublicUrl(first);
          if (inferredUrl) {
            items = [{
              id: `__inferred__${path.basename(first)}`,
              ocrUrl: inferredUrl,
              ocrLabel: path.basename(first),
              ocrEngine: '',
              lineCount: 0,
              segmentCount: 0,
              createdAt: String(row.updated_at || row.created_at || new Date().toISOString())
            }];
          }
        }
      }
      if (!items.length) return;
      items.forEach((item) => {
        const ocrKind = getOcrKind(item);
        const activeUrl = String(ocrKind === 'photo' ? dc.photoOcrUrl || '' : dc.videoOcrUrl || '').trim();
        const label = String(item.ocrLabel || '').trim();
        const url = String(item.ocrUrl || '').trim();
        const urlFileName = path.basename(url || '');
        const lineCount = Number(item.lineCount || 0);
        const segmentCount = Number(item.segmentCount || 0);
        records.push({
          assetId: row.id,
          assetTitle: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          owner: String(row.owner || ''),
          itemId: String(item.id || ''),
          ocrKind,
          ocrLabel: label || (ocrKind === 'photo' ? 'photo-ocr' : 'video-ocr'),
          ocrUrl: url,
          ocrEngine: String(item.ocrEngine || ''),
          lineCount: Number.isFinite(lineCount) ? lineCount : 0,
          segmentCount: Number.isFinite(segmentCount) ? segmentCount : 0,
          active: activeUrl && url ? activeUrl === url : false,
          createdAt: String(item.createdAt || row.updated_at || '')
        });
      });
    });
    return res.json(paginateAdminRecords(records, pagination));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load OCR records' });
  }
});

app.patch('/api/admin/ocr-records', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const nextLabel = String(req.body?.ocrLabel || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    if (!nextLabel) return res.status(400).json({ error: 'ocrLabel is required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const allItems = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    const target = allItems.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const ocrKind = getOcrKind(target);
    const items = getOcrItemsForKind(dc, ocrKind);
    const idx = items.findIndex((item) => String(item.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'OCR record not found' });
    items[idx] = { ...items[idx], ocrLabel: nextLabel };
    const activeUrl = String(ocrKind === 'photo' ? dc.photoOcrUrl || '' : dc.videoOcrUrl || '').trim();
    const updatedDc = applyOcrKindToDc(dc, ocrKind, items, activeUrl);
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update OCR record' });
  }
});

app.delete('/api/admin/ocr-records', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const deleteFile = Boolean(req.body?.deleteFile);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    const target = items.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const ocrKind = getOcrKind(target);
    const nextItems = getOcrItemsForKind(dc, ocrKind).filter((item) => String(item.id || '') !== itemId);
    const prevActiveUrl = String(ocrKind === 'photo' ? dc.photoOcrUrl || '' : dc.videoOcrUrl || '').trim();
    const updatedDc = applyOcrKindToDc(dc, ocrKind, nextItems, prevActiveUrl);
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    await pool.query(
      'DELETE FROM asset_ocr_segments WHERE asset_id = $1 AND ocr_url = $2',
      [assetId, String(target.ocrUrl || '').trim()]
    );

    if (deleteFile) {
      const filePath = resolveOcrFilePath(target.ocrUrl);
      if (filePath) cleanupAssetFiles([filePath]);
    }
    return res.json({ ok: true, removedFile: deleteFile });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete OCR record' });
  }
});

function computeOcrStatsFromContent(content) {
  const text = String(content || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/^WEBVTT$/i.test(line));
  const segmentCount = (text.match(/\[[0-9:.]+\s*-->\s*[0-9:.]+\]/g) || []).length;
  return {
    lineCount: lines.length,
    segmentCount: segmentCount > 0 ? segmentCount : lines.length
  };
}

app.get('/api/admin/ocr-records/content', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.query.assetId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const resolved = resolveAdminOcrItemForAssetRow(row, itemId);
    const item = resolved.item;
    if (!item) return res.status(404).json({ error: 'OCR record not found' });
    const filePath = resolveOcrFilePath(item.ocrUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({ content, ocrUrl: item.ocrUrl || '' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to read OCR content' });
  }
});

app.patch('/api/admin/ocr-records/content', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const content = String(req.body?.content || '');
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const resolved = resolveAdminOcrItemForAssetRow(row, itemId);
    const target = resolved.item;
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const ocrKind = getOcrKind(target);
    const items = getOcrItemsForKind(dc, ocrKind);
    let idx = items.findIndex((it) => String(it.id || '') === itemId);
    const filePath = resolveOcrFilePath(target.ocrUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    const stats = computeOcrStatsFromContent(content);
    if (idx < 0) {
      // First edit of an inferred OCR file: persist it as a managed OCR item.
      items.push({
        id: nanoid(),
        ocrUrl: String(target.ocrUrl || '').trim(),
        ocrLabel: buildOcrDisplayLabel({
          assetTitle: String(row?.title || ''),
          fileName: String(row?.file_name || ''),
          createdAt: new Date().toISOString(),
          engine: normalizeOcrEngine(target.ocrEngine || 'paddle'),
          version: items.length + 1
        }),
        ocrEngine: normalizeOcrEngine(target.ocrEngine || 'paddle'),
        lineCount: Math.max(0, Number(stats.lineCount) || 0),
        segmentCount: Math.max(0, Number(stats.segmentCount) || 0),
        createdAt: new Date().toISOString(),
        ocrKind
      });
      idx = items.length - 1;
    } else {
      items[idx] = {
        ...target,
        lineCount: Math.max(0, Number(stats.lineCount) || 0),
        segmentCount: Math.max(0, Number(stats.segmentCount) || 0)
      };
    }
    const persistedItem = items[idx] || null;
    const activeUrl = String(ocrKind === 'photo' ? dc.photoOcrUrl || '' : dc.videoOcrUrl || '').trim();
    const updatedDc = applyOcrKindToDc(dc, ocrKind, items, activeUrl || String(persistedItem?.ocrUrl || '').trim());
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    await syncOcrSegmentIndexForAsset(assetId, String(target.ocrUrl || '').trim(), {
      sourceEngine: String(target.ocrEngine || 'paddle').trim(),
      lang: ''
    });
    return res.json({ ok: true, lineCount: stats.lineCount, segmentCount: stats.segmentCount });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save OCR content' });
  }
});

function getSubtitleItemsFromDc(dcMetadata = {}) {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  let items = sanitizeSubtitleItems(dc.subtitleItems);
  if (!items.length && String(dc.subtitleUrl || '').trim()) {
    items = [{
      id: nanoid(),
      subtitleUrl: String(dc.subtitleUrl || '').trim(),
      subtitleLang: normalizeSubtitleLang(dc.subtitleLang),
      subtitleLabel: String(dc.subtitleLabel || '').trim() || 'subtitle',
      createdAt: new Date().toISOString()
    }];
  }
  return items;
}

function findSubtitleMatchInText(text, queryNorm) {
  return findSubtitleMatchesInText(text, queryNorm, 1)[0] || null;
}

app.get('/api/admin/subtitle-records', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const q = String(req.query.q || '').trim().toLocaleLowerCase('tr');
    const pagination = getAdminRecordPagination(req.query || {});
    const assetScanLimit = 5000;
    const params = [];
    const where = [];
    appendTextAdminAssetAccessWhere(where, params, gate, 'assets');
    params.push(assetScanLimit);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT assets.id, assets.title, assets.file_name, assets.type, assets.owner, assets.updated_at, assets.dc_metadata
        FROM assets
        ${whereSql}
        ORDER BY assets.updated_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    const records = [];
    result.rows.forEach((row) => {
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const items = getSubtitleItemsFromDc(dc);
      if (!items.length) return;
      const activeUrl = String(dc.subtitleUrl || '').trim();
      items.forEach((item) => {
        const label = String(item.subtitleLabel || '').trim();
        const lang = normalizeSubtitleLang(item.subtitleLang);
        const url = String(item.subtitleUrl || '').trim();
        const hitText = `${row.title || ''} ${row.file_name || ''} ${label} ${lang} ${url}`.toLocaleLowerCase('tr');
        if (q && !hitText.includes(q)) return;
        records.push({
          assetId: row.id,
          assetTitle: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          owner: String(row.owner || ''),
          itemId: String(item.id || ''),
          subtitleLabel: label || 'subtitle',
          subtitleLang: lang,
          subtitleUrl: url,
          active: activeUrl && url ? activeUrl === url : false,
          createdAt: String(item.createdAt || row.updated_at || '')
        });
      });
    });
    return res.json(paginateAdminRecords(records, pagination));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load subtitle records' });
  }
});

app.patch('/api/admin/subtitle-records', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const nextLabel = String(req.body?.subtitleLabel || '').trim();
    const nextLang = normalizeSubtitleLang(req.body?.subtitleLang || 'tr');
    const setActive = Boolean(req.body?.setActive);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    if (!nextLabel) return res.status(400).json({ error: 'subtitleLabel is required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const idx = items.findIndex((item) => String(item.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'Subtitle record not found' });
    items[idx] = { ...items[idx], subtitleLabel: nextLabel, subtitleLang: nextLang };

    const prevActive = String(dc.subtitleUrl || '').trim();
    const chosen = setActive
      ? items[idx]
      : (items.find((it) => String(it.subtitleUrl || '').trim() === prevActive) || items[idx]);
    const updatedDc = {
      ...dc,
      subtitleItems: items,
      subtitleUrl: String(chosen.subtitleUrl || '').trim(),
      subtitleLabel: String(chosen.subtitleLabel || '').trim(),
      subtitleLang: normalizeSubtitleLang(chosen.subtitleLang)
    };
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update subtitle record' });
  }
});

app.delete('/api/admin/subtitle-records', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const deleteFile = Boolean(req.body?.deleteFile);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const target = items.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'Subtitle record not found' });

    const nextItems = items.filter((item) => String(item.id || '') !== itemId);
    const prevActive = String(dc.subtitleUrl || '').trim();
    let nextActive = nextItems.find((it) => String(it.subtitleUrl || '').trim() === prevActive) || null;
    if (!nextActive && nextItems.length) nextActive = nextItems[nextItems.length - 1];
    const updatedDc = {
      ...dc,
      subtitleItems: nextItems,
      subtitleUrl: nextActive ? String(nextActive.subtitleUrl || '').trim() : '',
      subtitleLabel: nextActive ? String(nextActive.subtitleLabel || '').trim() : '',
      subtitleLang: nextActive ? normalizeSubtitleLang(nextActive.subtitleLang) : ''
    };
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}

    if (deleteFile) {
      const filePath = resolveSubtitleFilePath(target.subtitleUrl);
      if (filePath) cleanupAssetFiles([filePath]);
    }
    return res.json({ ok: true, removedFile: deleteFile });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete subtitle record' });
  }
});

app.get('/api/admin/subtitle-records/content', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.query.assetId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const item = items.find((it) => String(it.id || '') === itemId);
    if (!item) return res.status(404).json({ error: 'Subtitle record not found' });
    const filePath = resolveSubtitleFilePath(item.subtitleUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({ content, subtitleUrl: item.subtitleUrl || '' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to read subtitle content' });
  }
});

app.patch('/api/admin/subtitle-records/content', async (req, res) => {
  try {
    const gate = await requireTextAdminRequest(req, res);
    if (!gate) return null;
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const rawContent = String(req.body?.content || '');
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    if (!canTextAdminViewAsset(row, gate)) return res.status(404).json({ error: 'Asset not found' });
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const idx = items.findIndex((it) => String(it.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'Subtitle record not found' });
    const item = items[idx];
    const filePath = resolveSubtitleFilePath(item.subtitleUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    const ext = path.extname(filePath).toLowerCase();
    const nextContent = ext === '.vtt'
      ? normalizeVttContent(rawContent)
      : String(rawContent || '').replace(/\r\n?/g, '\n');
    fs.writeFileSync(filePath, nextContent, 'utf8');
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify({ ...dc, subtitleItems: items }), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save subtitle content' });
  }
});

app.get('/api/admin/text-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 200));
    const assetRes = await pool.query(
      `
        SELECT id, title, file_name, type, dc_metadata, updated_at
        FROM assets
        ORDER BY updated_at DESC
        LIMIT 800
      `
    );
    const out = [];
    for (const row of assetRes.rows) {
      const assetTitle = String(row.title || row.file_name || row.id || '');
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};

      const subtitleItems = getSubtitleItemsFromDc(dc);
      for (const item of subtitleItems) {
        const subtitlePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
        if (!subtitlePath || !fs.existsSync(subtitlePath)) continue;
        let raw = '';
        try { raw = fs.readFileSync(subtitlePath, 'utf8'); } catch (_error) { continue; }
        const subtitleMatches = findSubtitleMatchesInText(raw, q, Math.max(1, limit - out.length));
        for (const cue of subtitleMatches) {
          out.push({
            source: 'subtitle',
            assetId: row.id,
            assetTitle,
            label: String(item.subtitleLabel || item.subtitleLang || 'subtitle'),
            timecode: formatTimecode(Number(cue.startSec || 0)),
            startSec: Number(cue.startSec || 0),
            text: String(cue.cueText || '')
          });
          if (out.length >= limit) return res.json({ results: out });
        }
      }

      const ocrHit = await findOcrMatchForAssetRow(row, q);
      if (ocrHit) {
        out.push({
          source: 'ocr',
          assetId: row.id,
          assetTitle,
          label: String(dc.videoOcrLabel || 'video-ocr'),
          timecode: formatTimecode(Number(ocrHit.startSec || 0)),
          startSec: Number(ocrHit.startSec || 0),
          text: String(ocrHit.line || '')
        });
        if (out.length >= limit) return res.json({ results: out });
      }
    }
    return res.json({ results: out });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to run combined text search' });
  }
});

app.get('/api/admin/workflow-tracking', async (_req, res) => {
  try {
    const [statusCounts, typeCounts, totals, proxyRows] = await Promise.all([
      pool.query(
        `
          SELECT status, COUNT(*)::int AS count
          FROM assets
          WHERE deleted_at IS NULL
          GROUP BY status
          ORDER BY status
        `
      ),
      pool.query(
        `
          SELECT type, COUNT(*)::int AS count
          FROM assets
          WHERE deleted_at IS NULL
          GROUP BY type
          ORDER BY type
        `
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_all,
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_active,
            COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS total_trash
          FROM assets
        `
      ),
      pool.query(
        `
          SELECT id, deleted_at, type, mime_type, file_name, proxy_url
          FROM assets
        `
      )
    ]);

    const statusMap = Object.fromEntries(WORKFLOW.map((s) => [s, 0]));
    statusCounts.rows.forEach((row) => {
      statusMap[row.status] = row.count;
    });

    const types = {};
    typeCounts.rows.forEach((row) => {
      types[row.type] = row.count;
    });

    const proxies = { ready: 0, missing: 0 };
    proxyRows.rows.forEach((row) => {
      if (row.deleted_at) return;
      const isVideo = isVideoCandidate({
        mimeType: row.mime_type,
        fileName: row.file_name,
        declaredType: row.type
      });
      if (!isVideo) return;
      if (hasStoredFile(row.proxy_url, 'proxies')) proxies.ready += 1;
      else proxies.missing += 1;
    });

    return res.json({
      totals: totals.rows[0],
      workflow: statusMap,
      types,
      proxies
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load workflow tracking' });
  }
});

app.get('/api/admin/settings', async (_req, res) => {
  try {
    const settings = await getAdminSettings();
    return res.json(settings);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.patch('/api/admin/settings', async (req, res) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'backup')) {
      const effective = await requireFullAdminRequest(req, res);
      if (!effective) return null;
    }
    const current = await getAdminSettings();
    const next = {
      ...current,
      workflowTrackingEnabled: Object.prototype.hasOwnProperty.call(req.body, 'workflowTrackingEnabled')
        ? Boolean(req.body.workflowTrackingEnabled)
        : current.workflowTrackingEnabled,
      autoProxyBackfillOnUpload: Object.prototype.hasOwnProperty.call(req.body, 'autoProxyBackfillOnUpload')
        ? Boolean(req.body.autoProxyBackfillOnUpload)
        : current.autoProxyBackfillOnUpload,
      allowFilelessAssetCreation: Object.prototype.hasOwnProperty.call(req.body, 'allowFilelessAssetCreation')
        ? Boolean(req.body.allowFilelessAssetCreation)
        : Boolean(current.allowFilelessAssetCreation),
      newAssetDefaultVisibility: Object.prototype.hasOwnProperty.call(req.body, 'newAssetDefaultVisibility')
        ? normalizeNewAssetDefaultVisibility(req.body.newAssetDefaultVisibility)
        : normalizeNewAssetDefaultVisibility(current.newAssetDefaultVisibility),
      playerUiMode: Object.prototype.hasOwnProperty.call(req.body, 'playerUiMode')
        ? normalizePlayerUiMode(req.body.playerUiMode)
        : normalizePlayerUiMode(current.playerUiMode),
      ocrDefaultAdvancedMode: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultAdvancedMode')
        ? Boolean(req.body.ocrDefaultAdvancedMode)
        : current.ocrDefaultAdvancedMode,
      ocrDefaultTurkishAiCorrect: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultTurkishAiCorrect')
        ? Boolean(req.body.ocrDefaultTurkishAiCorrect)
        : current.ocrDefaultTurkishAiCorrect,
      ocrDefaultEnableBlurFilter: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultEnableBlurFilter')
        ? Boolean(req.body.ocrDefaultEnableBlurFilter)
        : current.ocrDefaultEnableBlurFilter,
      ocrDefaultEnableRegionMode: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultEnableRegionMode')
        ? Boolean(req.body.ocrDefaultEnableRegionMode)
        : current.ocrDefaultEnableRegionMode,
      ocrDefaultIgnoreStaticOverlays: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultIgnoreStaticOverlays')
        ? Boolean(req.body.ocrDefaultIgnoreStaticOverlays)
        : current.ocrDefaultIgnoreStaticOverlays,
      subtitleStyle: Object.prototype.hasOwnProperty.call(req.body, 'subtitleStyle')
        ? normalizeSubtitleStyle(req.body.subtitleStyle)
        : normalizeSubtitleStyle(current.subtitleStyle),
      auditRetentionDays: Object.prototype.hasOwnProperty.call(req.body, 'auditRetentionDays')
        ? normalizeAuditRetentionDays(req.body.auditRetentionDays)
        : normalizeAuditRetentionDays(current.auditRetentionDays),
      mediaJobRetentionDays: Object.prototype.hasOwnProperty.call(req.body, 'mediaJobRetentionDays')
        ? normalizeMediaJobRetentionDays(req.body.mediaJobRetentionDays)
        : normalizeMediaJobRetentionDays(current.mediaJobRetentionDays),
      authSession: Object.prototype.hasOwnProperty.call(req.body, 'authSession')
        ? normalizeAuthSessionSettings(req.body.authSession)
        : normalizeAuthSessionSettings(current.authSession),
      backup: Object.prototype.hasOwnProperty.call(req.body, 'backup')
        ? normalizeBackupSettings(req.body.backup)
        : normalizeBackupSettings(current.backup),
      apiTokenEnabled: Object.prototype.hasOwnProperty.call(req.body, 'apiTokenEnabled')
        ? Boolean(req.body.apiTokenEnabled)
        : current.apiTokenEnabled,
      apiToken: Object.prototype.hasOwnProperty.call(req.body, 'apiToken')
        ? String(req.body.apiToken || '').trim()
        : current.apiToken,
      oidcBearerEnabled: Object.prototype.hasOwnProperty.call(req.body, 'oidcBearerEnabled')
        ? Boolean(req.body.oidcBearerEnabled)
        : current.oidcBearerEnabled,
      oidcIssuerUrl: Object.prototype.hasOwnProperty.call(req.body, 'oidcIssuerUrl')
        ? String(req.body.oidcIssuerUrl || '').trim()
        : current.oidcIssuerUrl,
      oidcJwksUrl: Object.prototype.hasOwnProperty.call(req.body, 'oidcJwksUrl')
        ? String(req.body.oidcJwksUrl || '').trim()
        : current.oidcJwksUrl,
      oidcAudience: Object.prototype.hasOwnProperty.call(req.body, 'oidcAudience')
        ? String(req.body.oidcAudience || '').trim()
        : current.oidcAudience
    };
    const saved = await saveAdminSettings(next);
    cleanupAuditEvents?.(saved.auditRetentionDays).catch(() => {});
    cleanupMediaProcessingJobs?.(saved.mediaJobRetentionDays).catch(() => {});
    if (systemHealthCache) {
      systemHealthCache.expiresAt = 0;
      systemHealthCache.value = null;
    }
    return res.json(saved);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.patch('/api/admin/identity/session-settings', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const current = await getAdminSettings();
    const authSession = normalizeAuthSessionSettings(req.body?.authSession || req.body || {});
    const next = {
      ...current,
      authSession
    };
    const applied = await applyKeycloakAuthSessionSettings(authSession);
    const saved = await saveAdminSettings(next);
    await recordAuditEvent(req, {
      action: 'admin.settings.auth_session',
      targetType: 'settings',
      targetId: 'authSession',
      targetTitle: 'Authentication session settings',
      details: {
        authSession: saved.authSession,
        realms: applied.realms
      }
    });
    return res.json({
      authSession: saved.authSession,
      realms: applied.realms
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to save authentication session settings' });
  }
});

app.get('/api/admin/backups', async (req, res) => {
  try {
    const effective = await requireFullAdminRequest(req, res);
    if (!effective) return null;
    const settings = await getAdminSettings();
    const backup = normalizeBackupSettings(settings.backup);
    const listed = await listBackupFiles(backup);
    return res.json({
      settings: backup,
      directory: listed.directory,
      files: listed.files
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load backups' });
  }
});

app.post('/api/admin/backups/run', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const settings = await getAdminSettings();
    const backup = normalizeBackupSettings(
      req.body && Object.keys(req.body).length ? req.body : settings.backup
    );
    const result = await runSystemBackup(backup, effective.username || effective.displayName || 'admin');
    await recordAuditEvent?.(req, {
      action: 'backup.created',
      targetType: 'system',
      targetId: 'backup',
      targetTitle: result.directory,
      details: {
        files: result.files.map((file) => ({ type: file.type, path: file.path, size: file.size })),
        requestedBy: result.requestedBy
      }
    });
    return res.status(201).json(result);
  } catch (error) {
    const status = error?.code === 'backup_in_progress' ? 409 : 500;
    return res.status(status).json({ error: String(error?.message || 'Failed to run backup') });
  }
});

app.delete('/api/admin/backups/:fileName', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const fileName = path.basename(String(req.params.fileName || '').trim());
    if (!/^mam-backup-[A-Za-z0-9_.-]+$/.test(fileName)) {
      return res.status(400).json({ error: 'Invalid backup file name' });
    }
    const settings = await getAdminSettings();
    const backup = normalizeBackupSettings(settings.backup);
    const listed = await listBackupFiles(backup);
    const target = (listed.files || []).find((file) => file.fileName === fileName);
    if (!target) return res.status(404).json({ error: 'Backup file not found' });
    const directory = path.resolve(listed.directory);
    const filePath = path.resolve(directory, fileName);
    if (!filePath.startsWith(`${directory}${path.sep}`)) {
      return res.status(400).json({ error: 'Invalid backup file path' });
    }
    await fs.promises.unlink(filePath);
    await recordAuditEvent?.(req, {
      action: 'backup.deleted',
      targetType: 'system',
      targetId: fileName,
      targetTitle: fileName,
      details: {
        path: filePath,
        deletedBy: effective.username || effective.displayName || 'admin'
      }
    });
    return res.json({ ok: true, fileName });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || 'Failed to delete backup') });
  }
});

app.get('/api/admin/audit-events', async (req, res) => {
  try {
    const { where, values } = await buildAuditEventFilters(req);

    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    values.push(limit);
    const result = await pool.query(
      `
        SELECT id, created_at, actor, action, target_type, target_id, target_title, client_medium, details, ip, user_agent
        FROM audit_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      events: result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actor: row.actor,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        targetTitle: row.target_title,
        clientMedium: row.client_medium || '',
        details: row.details || {},
        ip: row.ip,
        userAgent: row.user_agent
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load audit events' });
  }
});

app.post('/api/admin/audit-events/cleanup', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const from = String(req.body?.from || '').trim();
    const to = String(req.body?.to || '').trim();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(from) || !datePattern.test(to)) {
      return res.status(400).json({ error: 'Audit silme için başlangıç ve bitiş tarihi gereklidir' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'Başlangıç tarihi bitiş tarihinden sonra olamaz' });
    }
    const result = await pool.query(
      `DELETE FROM audit_events
       WHERE created_at >= $1::date
         AND created_at < ($2::date + INTERVAL '1 day')`,
      [from, to]
    );
    return res.json({ ok: true, from, to, deletedEvents: Number(result.rowCount || 0) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to clean audit events' });
  }
});

async function buildAuditEventFilters(req) {
  const where = [];
  const values = [];
  const action = String(req.query.action || '').trim();
  const actor = String(req.query.actor || '').trim();
  const target = String(req.query.target || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  if (action) {
    values.push(action);
    where.push(`action = $${values.length}`);
  }
  if (actor) {
    values.push(`%${actor.toLowerCase()}%`);
    where.push(`LOWER(actor) LIKE $${values.length}`);
  }
  if (target) {
    const elasticTargetIds = await suggestAssetIdsElastic?.(target, 100).catch(() => null);
    const targetConditions = [];
    values.push(`%${target.toLowerCase()}%`);
    targetConditions.push(`LOWER(target_id) LIKE $${values.length}`);
    targetConditions.push(`LOWER(target_title) LIKE $${values.length}`);
    if (Array.isArray(elasticTargetIds) && elasticTargetIds.length) {
      values.push(elasticTargetIds);
      targetConditions.push(`target_id = ANY($${values.length}::text[])`);
    }
    where.push(`(${targetConditions.join(' OR ')})`);
  }
  if (from) {
    values.push(from);
    where.push(`created_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    where.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  return { where, values };
}

function safeCsvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function auditDetailsForExport(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return '';
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')}`)
    .join(' | ');
}

app.get('/api/admin/audit-events/export', async (req, res) => {
  try {
    const { where, values } = await buildAuditEventFilters(req);
    const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 5000));
    values.push(limit);
    const result = await pool.query(
      `
        SELECT created_at, actor, action, target_type, target_id, target_title, client_medium, details, ip, user_agent
        FROM audit_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    const headers = ['Created At', 'Actor', 'Action', 'Target Type', 'Target ID', 'Target Title', 'Client', 'IP', 'Details', 'User Agent'];
    const rows = result.rows.map((row) => [
      row.created_at ? new Date(row.created_at).toISOString() : '',
      row.actor || '',
      row.action || '',
      row.target_type || '',
      row.target_id || '',
      row.target_title || '',
      row.client_medium || '',
      row.ip || '',
      auditDetailsForExport(row.details || {}),
      row.user_agent || ''
    ]);
    const csv = [
      headers.map(safeCsvCell).join(','),
      ...rows.map((row) => row.map(safeCsvCell).join(','))
    ].join('\r\n');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-events-${stamp}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to export audit events' });
  }
});

function uniquePermissionKeys(keys) {
  const seen = new Set();
  (Array.isArray(keys) ? keys : []).forEach((key) => {
    const normalized = String(key || '').trim();
    if (PERMISSION_KEYS.includes(normalized)) seen.add(normalized);
  });
  return PERMISSION_KEYS.filter((key) => seen.has(key));
}

function normalizeGroupPermissionLookup(groups) {
  const lookup = new Map();
  Object.entries(groups && typeof groups === 'object' ? groups : {}).forEach(([groupName, entry]) => {
    const normalized = assetAccessService.normalizeAccessName(String(groupName || '').replace(/^\/+/, ''));
    if (normalized && !lookup.has(normalized)) lookup.set(normalized, entry);
  });
  return lookup;
}

function getPermissionGroupCandidateNames(savedGroups) {
  const names = new Set([
    'superadmin',
    'super admin',
    'super-admin',
    'super_admin',
    'admin',
    'standart yönetici',
    'standart yonetici',
    'altyazı_ocr_operator',
    'altyazi_ocr_operator'
  ]);
  Object.keys(savedGroups && typeof savedGroups === 'object' ? savedGroups : {}).forEach((name) => {
    const normalized = assetAccessService.normalizeAccessName(String(name || '').replace(/^\/+/, ''));
    if (normalized) names.add(normalized);
  });
  return Array.from(names);
}

function resolveInheritedPermissionKeysForGroups(groupPaths, savedGroups) {
  const groupValues = Array.isArray(groupPaths) ? groupPaths : [];
  const inherited = new Set(resolvePermissionKeysFromPrincipals({ groups: groupValues }).permissionKeys);
  const groupPermissionLookup = normalizeGroupPermissionLookup(savedGroups);
  groupValues
    .flatMap((group) => {
      const raw = String(group || '').trim();
      const withoutSlash = raw.replace(/^\/+/, '');
      const last = withoutSlash.split('/').filter(Boolean).pop() || '';
      return [raw, withoutSlash, last];
    })
    .map((value) => assetAccessService.normalizeAccessName(String(value || '').replace(/^\/+/, '')))
    .filter(Boolean)
    .forEach((candidate) => {
      const entry = groupPermissionLookup.get(candidate);
      if (!entry) return;
      normalizePermissionEntry(entry, []).permissionKeys.forEach((key) => inherited.add(key));
    });
  return uniquePermissionKeys(Array.from(inherited));
}

function resolveAssetDerivedPermissionKeysForUser({ username, displayName, email, groups, assetRows }) {
  const context = {
    username,
    displayName,
    email,
    groups: Array.isArray(groups) ? groups : [],
    roles: [],
    canAccessAdmin: false,
    canEditMetadata: false,
    canDeleteAssets: false,
    canUsePdfAdvancedTools: false,
    canEditOffice: false,
    deniedPermissionKeys: []
  };
  const keys = new Set();
  (Array.isArray(assetRows) ? assetRows : []).some((row) => {
    if (!assetAccessService.canEditAsset(row, context)) return false;
    keys.add('metadata.edit');
    if (isOfficeDocumentCandidate?.({ mimeType: row.mime_type, fileName: row.file_name })) keys.add('office.edit');
    if (isPdfCandidate?.({ mimeType: row.mime_type, fileName: row.file_name })) keys.add('pdf.advanced');
    return keys.has('metadata.edit') && keys.has('office.edit') && keys.has('pdf.advanced');
  });
  return uniquePermissionKeys(Array.from(keys));
}

app.get('/api/admin/user-permissions', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const q = String(req.query.q || '').trim().toLowerCase();
    const principalType = String(req.query.principalType || req.query.type || 'user').trim().toLowerCase() === 'group' ? 'group' : 'user';
    const limit = Number(req.query.limit) === 50 ? 50 : 20;
    const requestedPage = Math.max(1, Number(req.query.page) || 1);
    const saved = await getUserPermissionsSettings();
    const savedUsers = saved?.users && typeof saved.users === 'object' && !Array.isArray(saved.users) ? saved.users : {};
    const savedGroups = saved?.groups && typeof saved.groups === 'object' && !Array.isArray(saved.groups) ? saved.groups : {};
    const legacyUsers = Object.fromEntries(
      Object.entries(saved || {}).filter(([key]) => !['users', 'groups'].includes(String(key || '').trim()))
    );
    const userPermissionEntries = { ...legacyUsers, ...savedUsers };
    if (q.length < 2) {
      return res.json({
        users: [],
        availablePermissions: getPermissionDefinitionsPayload(),
        pagination: { page: 1, limit, total: 0, totalPages: 1 },
        source: 'search_required'
      });
    }
    if (principalType === 'group') {
      const [keycloakGroupsData, mamGroups] = await Promise.all([
        fetchKeycloakGroups(),
        collectMamAccessGroups()
      ]);
      const groupsByName = new Map();
      (Array.isArray(keycloakGroupsData?.groups) ? keycloakGroupsData.groups : []).forEach((group) => {
        const name = String(group?.name || group?.path || '').trim().replace(/^\/+/, '').toLowerCase();
        if (!name) return;
        groupsByName.set(name, {
          username: name,
          displayName: String(group?.name || name).trim(),
          path: String(group?.path || `/${name}`).trim(),
          source: 'keycloak'
        });
      });
      mamGroups.forEach((group) => {
        const name = String(group || '').trim().replace(/^\/+/, '').toLowerCase();
        if (!name || groupsByName.has(name)) return;
        groupsByName.set(name, {
          username: name,
          displayName: name,
          path: `/${name}`,
          source: 'mam'
        });
      });
      Object.keys(savedGroups || {}).forEach((group) => {
        const name = String(group || '').trim().replace(/^\/+/, '').toLowerCase();
        if (!name || groupsByName.has(name)) return;
        groupsByName.set(name, {
          username: name,
          displayName: name,
          path: `/${name}`,
          source: 'saved'
        });
      });
      const allGroups = Array.from(groupsByName.values())
        .filter((group) => [group.username, group.displayName, group.path].map((item) => String(item || '').toLowerCase()).join(' ').includes(q))
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((group) => {
          const entry = normalizePermissionEntry(savedGroups?.[group.username], []);
          return {
            ...group,
            principalType: 'group',
            permissionKeys: entry.permissionKeys,
            explicitPermissionKeys: entry.permissionKeys,
            inheritedPermissionKeys: [],
            deniedPermissionKeys: entry.deniedPermissionKeys,
            adminPageAccess: entry.adminPageAccess,
            textAdminAccess: entry.textAdminAccess,
            metadataEdit: entry.metadataEdit,
            assetDelete: entry.assetDelete,
            pdfAdvancedTools: entry.pdfAdvancedTools,
            documentRightsAdminAccess: entry.documentRightsAdminAccess,
            advancedSearchAccess: entry.advancedSearchAccess
          };
        });
      const total = allGroups.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * limit;
      return res.json({
        users: allGroups.slice(offset, offset + limit),
        availablePermissions: getPermissionDefinitionsPayload(),
        pagination: { page, limit, total, totalPages },
        source: 'groups'
      });
    }
    const kcData = await fetchKeycloakUsers({ search: q, max: 100 });
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    const mamAccessGroups = await collectMamAccessGroups();
    const [permissionDefaultsByUser, permissionGroupMembers, assetRowsResult] = await Promise.all([
      fetchKeycloakUserPermissionDefaults(kcUsers, kcData?.realmByUsername),
      fetchKeycloakGroupMembers(
        Array.from(new Set([...getPermissionGroupCandidateNames(savedGroups), ...mamAccessGroups])),
        { maxPerGroup: 1000 }
      ),
      pool.query('SELECT * FROM assets')
    ]);
    const assetRowsForPermissionDerivation = Array.isArray(assetRowsResult?.rows) ? assetRowsResult.rows : [];
    const keycloakUserByUsername = new Map();
    const usernames = new Set();
    kcUsers.forEach((row) => {
      const username = String(row?.username || '').trim().toLowerCase();
      if (!username) return;
      usernames.add(username);
      keycloakUserByUsername.set(username, row);
    });
    Object.keys(userPermissionEntries || {}).forEach((k) => {
      const username = String(k || '').trim().toLowerCase();
      if (!username) return;
      if (usernames.has(username)) usernames.add(username);
    });

    const allUsers = Array.from(usernames)
      .sort((a, b) => a.localeCompare(b))
      .map((username) => {
        const kcUser = keycloakUserByUsername.get(username) || {};
        const defaults = permissionDefaultsByUser.has(username)
          ? permissionDefaultsByUser.get(username)
          : [];
        const userGroups = permissionGroupMembers?.groupPathsByUsername?.get(username) || [];
        const assetDerivedPermissionKeys = resolveAssetDerivedPermissionKeysForUser({
          username,
          displayName: [kcUser?.firstName, kcUser?.lastName].map((item) => String(item || '').trim()).filter(Boolean).join(' '),
          email: String(kcUser?.email || '').trim(),
          groups: userGroups,
          assetRows: assetRowsForPermissionDerivation
        });
        const inheritedPermissionKeys = uniquePermissionKeys([
          ...defaults,
          ...resolveInheritedPermissionKeysForGroups(userGroups, savedGroups),
          ...assetDerivedPermissionKeys
        ]);
        const userEntry = normalizePermissionEntry(userPermissionEntries?.[username], []);
        const deniedPermissionKeys = uniquePermissionKeys(userEntry.deniedPermissionKeys || []);
        const merged = new Set([...inheritedPermissionKeys, ...userEntry.permissionKeys]);
        deniedPermissionKeys.forEach((key) => merged.delete(key));
        const effective = normalizePermissionEntry(null, uniquePermissionKeys(Array.from(merged)));
        return {
          username,
          displayName: [kcUser?.firstName, kcUser?.lastName].map((item) => String(item || '').trim()).filter(Boolean).join(' '),
          email: String(kcUser?.email || '').trim(),
          permissionKeys: effective.permissionKeys,
          explicitPermissionKeys: userEntry.permissionKeys,
          inheritedPermissionKeys,
          assetDerivedPermissionKeys,
          deniedPermissionKeys,
          groups: userGroups,
          adminPageAccess: effective.adminPageAccess,
          textAdminAccess: effective.textAdminAccess,
          metadataEdit: effective.metadataEdit,
          assetDelete: effective.assetDelete,
          pdfAdvancedTools: effective.pdfAdvancedTools,
          documentRightsAdminAccess: effective.documentRightsAdminAccess,
          advancedSearchAccess: effective.advancedSearchAccess
        };
      });
    const filteredUsers = q.length >= 2
      ? allUsers.filter((user) => [user.username, user.displayName, user.email].map((item) => String(item || '').toLowerCase()).join(' ').includes(q))
      : allUsers;
    const total = filteredUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * limit;
    const users = filteredUsers.slice(offset, offset + limit);
    return res.json({
      users,
      availablePermissions: getPermissionDefinitionsPayload(),
      pagination: { page, limit, total, totalPages },
      source: kcUsers.length ? 'keycloak' : 'fallback'
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load user permissions' });
  }
});

app.patch('/api/admin/user-permissions/:username', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });
    const kcData = await fetchKeycloakUsers({ search: username, max: 50 });
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    if (!kcUsers.length) {
      return res.status(503).json({ error: 'Failed to fetch users from Keycloak' });
    }
    const existsInKeycloak = kcUsers.some((row) => String(row?.username || '').trim().toLowerCase() === username);
    if (!existsInKeycloak) {
      return res.status(404).json({ error: 'User not found in Keycloak realm' });
    }

    const current = await getUserPermissionsSettings();
    const requestedPermissionKeys = Array.isArray(req.body?.permissionKeys)
      ? req.body.permissionKeys.filter((key) => PERMISSION_KEYS.includes(String(key || '').trim()))
      : null;
    const deniedPermissionKeys = Array.isArray(req.body?.deniedPermissionKeys)
      ? req.body.deniedPermissionKeys.filter((key) => PERMISSION_KEYS.includes(String(key || '').trim()))
      : [];
    const nextEntry = normalizePermissionEntry(
      {
        permissionKeys: requestedPermissionKeys,
        deniedPermissionKeys,
        adminPageAccess: req.body?.adminPageAccess,
        textAdminAccess: req.body?.textAdminAccess,
        metadataEdit: req.body?.metadataEdit,
        assetDelete: req.body?.assetDelete,
        pdfAdvancedTools: req.body?.pdfAdvancedTools,
        documentRightsAdminAccess: req.body?.documentRightsAdminAccess,
        advancedSearchAccess: req.body?.advancedSearchAccess
      },
      []
    );
    const savedUsers = current?.users && typeof current.users === 'object' && !Array.isArray(current.users) ? current.users : {};
    const savedGroups = current?.groups && typeof current.groups === 'object' && !Array.isArray(current.groups) ? current.groups : {};
    const legacyUsers = Object.fromEntries(
      Object.entries(current || {}).filter(([key]) => !['users', 'groups'].includes(String(key || '').trim()))
    );
    const next = {
      users: {
        ...legacyUsers,
        ...savedUsers,
        [username]: nextEntry
      },
      groups: savedGroups
    };
    await saveUserPermissionsSettings(next);
    return res.json({
      username,
      permissionKeys: nextEntry.permissionKeys,
      deniedPermissionKeys: nextEntry.deniedPermissionKeys,
      ...nextEntry
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save user permissions' });
  }
});

app.patch('/api/admin/group-permissions/:groupName', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const groupName = assetAccessService.normalizeAccessName(req.params.groupName || '');
    if (!groupName) return res.status(400).json({ error: 'groupName is required' });
    const [keycloakGroupsData, mamGroups] = await Promise.all([
      fetchKeycloakGroups(),
      collectMamAccessGroups()
    ]);
    const knownGroups = new Set(
      []
        .concat(Array.isArray(keycloakGroupsData?.groups) ? keycloakGroupsData.groups : [])
        .flatMap((group) => [group?.name, group?.path])
        .concat(mamGroups)
        .map((value) => assetAccessService.normalizeAccessName(value))
        .filter(Boolean)
    );
    if (!knownGroups.has(groupName)) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const current = await getUserPermissionsSettings();
    const requestedPermissionKeys = Array.isArray(req.body?.permissionKeys)
      ? req.body.permissionKeys.filter((key) => PERMISSION_KEYS.includes(String(key || '').trim()))
      : null;
    const nextEntry = normalizePermissionEntry(
      {
        permissionKeys: requestedPermissionKeys,
        adminPageAccess: req.body?.adminPageAccess,
        textAdminAccess: req.body?.textAdminAccess,
        metadataEdit: req.body?.metadataEdit,
        assetDelete: req.body?.assetDelete,
        pdfAdvancedTools: req.body?.pdfAdvancedTools,
        documentRightsAdminAccess: req.body?.documentRightsAdminAccess,
        advancedSearchAccess: req.body?.advancedSearchAccess
      },
      []
    );
    const savedUsers = current?.users && typeof current.users === 'object' && !Array.isArray(current.users) ? current.users : {};
    const savedGroups = current?.groups && typeof current.groups === 'object' && !Array.isArray(current.groups) ? current.groups : {};
    const legacyUsers = Object.fromEntries(
      Object.entries(current || {}).filter(([key]) => !['users', 'groups'].includes(String(key || '').trim()))
    );
    const next = {
      users: {
        ...legacyUsers,
        ...savedUsers
      },
      groups: {
        ...savedGroups,
        [groupName]: nextEntry
      }
    };
    await saveUserPermissionsSettings(next);
    return res.json({
      groupName,
      permissionKeys: nextEntry.permissionKeys,
      ...nextEntry
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save group permissions' });
  }
});

app.post('/api/admin/api-token/rotate', async (_req, res) => {
  try {
    const current = await getAdminSettings();
    const next = {
      ...current,
      apiToken: generateApiToken()
    };
    const saved = await saveAdminSettings(next);
    return res.json({ apiToken: saved.apiToken });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to rotate API token' });
  }
});

app.get('/api/admin/runtime-diagnostics', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(300, Number(req.query.limit) || 100));
    return res.json({
      activeUsers: typeof getActiveUsers === 'function' ? getActiveUsers() : [],
      errors: typeof getRuntimeErrorLogs === 'function' ? getRuntimeErrorLogs(limit) : []
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load runtime diagnostics' });
  }
});

function getDirSizeAndFiles(rootDir) {
  let totalBytes = 0;
  let totalFiles = 0;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    entries.forEach((entry) => {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        return;
      }
      if (!entry.isFile()) return;
      totalFiles += 1;
      try {
        const st = fs.statSync(abs);
        totalBytes += Math.max(0, Number(st.size) || 0);
      } catch (_error) {}
    });
  }
  return { totalBytes, totalFiles };
}

function getFsFreeAndTotal(targetDir) {
  try {
    if (typeof fs.statfsSync !== 'function') {
      return { freeBytes: 0, totalBytes: 0 };
    }
    const st = fs.statfsSync(targetDir);
    const blockSize = Math.max(0, Number(st.bsize || st.frsize || 0));
    const freeBlocks = Math.max(0, Number(st.bavail || st.bfree || 0));
    const totalBlocks = Math.max(0, Number(st.blocks || 0));
    return {
      freeBytes: blockSize * freeBlocks,
      totalBytes: blockSize * totalBlocks
    };
  } catch (_error) {
    return { freeBytes: 0, totalBytes: 0 };
  }
}

async function checkHttpService(url, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      ok: response.ok,
      status: response.status
    };
  } catch (_error) {
    clearTimeout(timer);
    return { ok: false, status: 0 };
  }
}

app.get('/api/admin/system-health', async (req, res) => {
  try {
    const forceRefresh = String(req.query?.refresh || '').trim() === '1';
    const nowMs = Date.now();
    if (!forceRefresh && systemHealthCache.value && systemHealthCache.expiresAt > nowMs) {
      return res.json({
        ...systemHealthCache.value,
        cached: true,
        cacheTtlSeconds: Math.max(0, Math.ceil((systemHealthCache.expiresAt - nowMs) / 1000))
      });
    }
    const buildHealthMediaJobSummary = (row) => {
      if (!row) return null;
      const jobType = normalizeMediaJobType(row.job_type);
      const resultPayload = row.result_payload && typeof row.result_payload === 'object' ? row.result_payload : {};
      const mapped = jobType === 'subtitle'
        ? mapSubtitleJobFromDbRow(row)
        : jobType === 'video_ocr'
          ? mapVideoOcrJobFromDbRow(row)
          : {
            jobId: String(row.job_id || ''),
            assetId: String(row.asset_id || ''),
            status: normalizeMediaJobStatus(row.status),
            updatedAt: row.updated_at,
            finishedAt: row.finished_at,
            warning: String(resultPayload.warning || ''),
            error: String(row.error_text || ''),
            model: String(resultPayload.model || 'gemma3:4b'),
            chunkCount: Number(resultPayload.chunkCount || 0)
          };
      const isMetadata = jobType === 'metadata_enrichment';
      return {
        jobId: mapped.jobId,
        assetId: mapped.assetId,
        jobType,
        assetTitle: String(row.asset_title || row.title || '').trim(),
        status: mapped.status,
        progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
        progressPhase: String(resultPayload.progressPhase || mapped.progressPhase || ''),
        createdAt: row.created_at,
        startedAt: row.started_at,
        updatedAt: mapped.updatedAt,
        finishedAt: mapped.finishedAt,
        warning: String(mapped.warning || ''),
        error: String(mapped.error || ''),
        label: isMetadata
          ? 'auto-metadata'
          : jobType === 'subtitle' ? String(mapped.subtitleLabel || '') : String(mapped.resultLabel || ''),
        model: isMetadata || jobType === 'subtitle' ? String(mapped.model || '') : '',
        engine: jobType === 'video_ocr' ? String(mapped.ocrEngine || '') : '',
        lineCount: jobType === 'video_ocr' ? Number(mapped.lineCount || 0) : 0,
        segmentCount: jobType === 'video_ocr' ? Number(mapped.segmentCount || 0) : 0,
        chunkCount: isMetadata ? Number(mapped.chunkCount || 0) : 0
      };
    };
    const settings = await getAdminSettings().catch(() => ({ mediaJobRetentionDays: 30 }));
    const mediaJobRetentionDays = Math.max(30, normalizeMediaJobRetentionDays(settings.mediaJobRetentionDays));
    cleanupMediaProcessingJobs?.(mediaJobRetentionDays).catch(() => {});

    const orphanedActiveJobs = await pool.query(
      `
        SELECT job_id, job_type
        FROM media_processing_jobs
        WHERE status IN ('running', 'queued')
          AND job_type IN ('subtitle', 'video_ocr', 'metadata_enrichment')
      `
    );
    const orphanedIds = orphanedActiveJobs.rows
      .filter((row) => {
        const jobId = String(row.job_id || '');
        const type = String(row.job_type || '');
        const inMemory = type === 'subtitle'
          ? subtitleJobs?.get(jobId)
          : type === 'video_ocr'
            ? videoOcrJobs?.get(jobId)
            : metadataEnrichmentService?.hasJob?.(jobId);
        return !inMemory && !hasActiveMediaJobRuntime?.(jobId);
      })
      .map((row) => String(row.job_id || ''))
      .filter(Boolean);
    if (orphanedIds.length) {
      await pool.query(
        `
          UPDATE media_processing_jobs
          SET status = 'failed',
              error_text = CASE WHEN error_text = '' THEN 'Interrupted by application restart' ELSE error_text END,
              result_payload = result_payload || '{"progressPhase":"interrupted"}'::jsonb,
              finished_at = NOW(),
              updated_at = NOW()
          WHERE job_id = ANY($1::text[])
        `,
        [orphanedIds]
      );
    }

    const [proxyRunning, proxyFailed] = [
      Array.from(proxyJobs.values()).filter((job) => ['running', 'queued'].includes(String(job.status || ''))).length,
      Array.from(proxyJobs.values()).filter((job) => String(job.status || '') === 'failed').length
    ];
    const mediaJobsStats = await pool.query(
      `
        SELECT job_type, status, COUNT(*)::int AS count
        FROM media_processing_jobs
        WHERE job_type IN ('subtitle', 'video_ocr', 'metadata_enrichment')
          AND updated_at >= NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY job_type, status
      `,
      [mediaJobRetentionDays]
    );
    const mediaCounts = {};
    mediaJobsStats.rows.forEach((row) => {
      const key = `${String(row.job_type || '')}:${String(row.status || '')}`;
      mediaCounts[key] = Number(row.count || 0);
    });
    const subtitleRunning = (mediaCounts['subtitle:running'] || 0) + (mediaCounts['subtitle:queued'] || 0);
    const ocrRunning = (mediaCounts['video_ocr:running'] || 0) + (mediaCounts['video_ocr:queued'] || 0);
    const subtitleFailed = mediaCounts['subtitle:failed'] || 0;
    const ocrFailed = mediaCounts['video_ocr:failed'] || 0;
    const metadataRunning = (mediaCounts['metadata_enrichment:running'] || 0) + (mediaCounts['metadata_enrichment:queued'] || 0);
    const metadataFailed = mediaCounts['metadata_enrichment:failed'] || 0;

    const { totalBytes: uploadsBytes, totalFiles: uploadsFiles } = getDirSizeAndFiles(UPLOADS_DIR);
    const fsInfo = getFsFreeAndTotal(UPLOADS_DIR);

    const assetRows = await pool.query(
      'SELECT id, proxy_url, thumbnail_url, dc_metadata FROM assets ORDER BY updated_at DESC LIMIT 5000'
    );
    let missingProxy = 0;
    let missingThumbnail = 0;
    let missingSubtitle = 0;
    let missingOcr = 0;
    assetRows.rows.forEach((row) => {
      const proxyAbs = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.proxy_url, 'proxies'));
      if (proxyAbs && !fs.existsSync(proxyAbs)) missingProxy += 1;
      const thumbAbs = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.thumbnail_url, 'thumbnails'));
      if (thumbAbs && !fs.existsSync(thumbAbs)) missingThumbnail += 1;
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const subUrl = String(dc.subtitleUrl || '').trim();
      const subAbs = subUrl ? publicUploadUrlToAbsolutePath(subUrl) : '';
      if (subAbs && !fs.existsSync(subAbs)) missingSubtitle += 1;
      const ocrUrl = pickLatestVideoOcrUrlFromDc(dc);
      const ocrAbs = ocrUrl ? publicUploadUrlToAbsolutePath(ocrUrl) : '';
      if (ocrAbs && !fs.existsSync(ocrAbs)) missingOcr += 1;
    });

    const [postgresCheck, elasticCheck, keycloakCheck, oauth2ProxyCheck] = await Promise.all([
      pool.query('SELECT 1 AS ok').then(() => ({ ok: true, status: 200 })).catch(() => ({ ok: false, status: 0 })),
      checkHttpService('http://elasticsearch:9200'),
      checkHttpService('http://keycloak:8080/realms/mam'),
      checkHttpService('http://oauth2-proxy:4180/ping')
    ]);

    const recentJobsResult = await pool.query(
      `
        SELECT mpj.*, a.title AS asset_title
        FROM media_processing_jobs mpj
        LEFT JOIN assets a ON a.id = mpj.asset_id
        WHERE mpj.job_type IN ('subtitle', 'video_ocr', 'metadata_enrichment')
          AND mpj.updated_at >= NOW() - ($1::int * INTERVAL '1 day')
        ORDER BY mpj.updated_at DESC
        LIMIT 1000
      `,
      [mediaJobRetentionDays]
    );
    const recentJobs = {
      subtitle: { active: null, latestCompleted: null, latestFailed: null },
      ocr: { active: null, latestCompleted: null, latestFailed: null },
      metadata: { active: null, latestCompleted: null, latestFailed: null }
    };
    recentJobsResult.rows.forEach((row) => {
      const typeKey = String(row.job_type || '') === 'video_ocr'
        ? 'ocr'
        : String(row.job_type || '') === 'metadata_enrichment' ? 'metadata' : 'subtitle';
      const status = normalizeMediaJobStatus(row.status);
      const summary = buildHealthMediaJobSummary(row);
      if (!summary) return;
      if (!recentJobs[typeKey].active && (status === 'running' || status === 'queued')) {
        recentJobs[typeKey].active = summary;
      }
      if (!recentJobs[typeKey].latestCompleted && status === 'completed') {
        recentJobs[typeKey].latestCompleted = summary;
      }
      if (!recentJobs[typeKey].latestFailed && status === 'failed') {
        recentJobs[typeKey].latestFailed = summary;
      }
    });
    const mediaJobs = recentJobsResult.rows
      .map((row) => buildHealthMediaJobSummary(row))
      .filter(Boolean)
      .map((job) => ({
        ...job,
        cancelable: ['subtitle', 'video_ocr', 'metadata_enrichment'].includes(String(job.jobType || ''))
          && ['queued', 'running'].includes(String(job.status || ''))
      }));

    const payload = {
      disk: {
        uploadsBytes,
        uploadsFiles,
        fsFreeBytes: fsInfo.freeBytes,
        fsTotalBytes: fsInfo.totalBytes
      },
      jobs: {
        proxyRunning,
        subtitleRunning,
        ocrRunning,
        metadataRunning,
        proxyFailed,
        subtitleFailed,
        ocrFailed,
        metadataFailed
      },
      services: {
        app: { ok: true, status: 200 },
        postgres: postgresCheck,
        elasticsearch: elasticCheck,
        keycloak: keycloakCheck,
        oauth2Proxy: oauth2ProxyCheck
      },
      integrity: {
        missingProxy,
        missingThumbnail,
        missingSubtitle,
        missingOcr
      },
      recentJobs,
      mediaJobs,
      mediaJobRetentionDays
    };
    systemHealthCache.expiresAt = Date.now() + SYSTEM_HEALTH_CACHE_TTL_MS;
    systemHealthCache.value = payload;
    return res.json({ ...payload, cached: false, cacheTtlSeconds: Math.ceil(SYSTEM_HEALTH_CACHE_TTL_MS / 1000) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load system health' });
  }
});

app.post('/api/admin/media-jobs/:jobId/cancel', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return undefined;
    const jobId = String(req.params.jobId || '').trim();
    if (!jobId) return res.status(400).json({ error: 'Media job id is required' });
    const result = await pool.query(
      `SELECT job_id, job_type, status FROM media_processing_jobs WHERE job_id = $1 LIMIT 1`,
      [jobId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Media job not found' });
    const row = result.rows[0];
    if (!['queued', 'running'].includes(String(row.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'Media job is not active' });
    }
    const jobType = String(row.job_type || '');
    if (jobType === 'metadata_enrichment') {
      await metadataEnrichmentService?.cancelJob?.(jobId);
    } else {
      cancelMediaJobRuntime?.(jobId);
    }
    const inMemoryJob = jobType === 'subtitle'
      ? subtitleJobs?.get(jobId)
      : jobType === 'video_ocr'
        ? videoOcrJobs?.get(jobId)
        : null;
    if (inMemoryJob) {
      inMemoryJob.status = 'cancelled';
      inMemoryJob.progressPhase = 'cancelled';
      inMemoryJob.error = 'Cancelled by administrator';
      inMemoryJob.finishedAt = new Date().toISOString();
      inMemoryJob.updatedAt = inMemoryJob.finishedAt;
    }
    await pool.query(
      `
        UPDATE media_processing_jobs
        SET status = 'cancelled',
            error_text = 'Cancelled by administrator',
            result_payload = result_payload || '{"progressPhase":"cancelled"}'::jsonb,
            finished_at = NOW(),
            updated_at = NOW()
        WHERE job_id = $1
      `,
      [jobId]
    );
    systemHealthCache.expiresAt = 0;
    systemHealthCache.value = null;
    await recordAuditEvent(req, {
      action: 'media_job.cancelled',
      targetType: 'media_job',
      targetId: jobId,
      details: { jobType: String(row.job_type || '') }
    }).catch(() => {});
    return res.json({ ok: true, jobId, status: 'cancelled' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to cancel media job' });
  }
});

app.get('/api/admin/ffmpeg-health', async (_req, res) => {
  try {
    const [ffmpeg, ffprobe] = await Promise.all([
      runCommandCapture('ffmpeg', ['-version']),
      runCommandCapture('ffprobe', ['-version'])
    ]);
    return res.json({
      ffmpegOk: ffmpeg.ok,
      ffprobeOk: ffprobe.ok,
      ffmpegInfo: (ffmpeg.stdout || ffmpeg.stderr).split('\n')[0] || '',
      ffprobeInfo: (ffprobe.stdout || ffprobe.stderr).split('\n')[0] || ''
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to check ffmpeg health' });
  }
});

app.post('/api/admin/search/reindex', async (_req, res) => {
  try {
    const indexed = await backfillElasticIndex();
    return res.json({ indexed });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to reindex search' });
  }
});

app.post('/api/admin/image-derivatives/repair', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return undefined;
    const requestedLimit = Number(req.body?.limit || req.query?.limit || 20);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 20));
    const result = await pool.query(
      `
        SELECT *
        FROM assets
        WHERE deleted_at IS NULL
          AND (
            LOWER(COALESCE(type, '')) IN ('photo', 'image', 'picture')
            OR LOWER(COALESCE(mime_type, '')) LIKE 'image/%'
            OR LOWER(COALESCE(file_name, '')) ~ '\\.(jpg|jpeg|png|gif|webp|tif|tiff|bmp|heic|heif)$'
          )
          AND (
            COALESCE(proxy_url, '') = ''
            OR COALESCE(thumbnail_url, '') = ''
            OR LOWER(COALESCE(thumbnail_url, '')) NOT LIKE '%/thumbnails/%'
          )
        ORDER BY created_at ASC NULLS FIRST
        LIMIT $1
      `,
      [limit]
    );
    const repaired = [];
    const failed = [];
    for (const row of result.rows) {
      try {
        const nextRow = await ensureImagePreviewAndThumbnailForRow(row);
        const hasPreview = Boolean(resolveStoredUrl(nextRow.proxy_url, 'proxies'));
        const hasThumbnail = Boolean(resolveStoredUrl(nextRow.thumbnail_url, 'thumbnails'));
        if (hasPreview && hasThumbnail) repaired.push(row.id);
        else failed.push({ id: row.id, fileName: row.file_name, error: 'Derivative output is missing' });
      } catch (error) {
        failed.push({ id: row.id, fileName: row.file_name, error: String(error?.message || error || '') });
      }
    }
    return res.json({ ok: true, scanned: result.rows.length, repaired, failed });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: String(error?.message || 'Failed to repair image derivatives') });
  }
});

app.post('/api/admin/proxy-jobs', async (req, res) => {
  const running = Array.from(proxyJobs.values()).find((job) => job.status === 'running' || job.status === 'queued');
  if (running) {
    return res.status(409).json({ error: 'A proxy job is already running', job: running });
  }

  const job = createProxyJob();
  setTimeout(() => {
    runProxyJob(job.id, { includeTrash: Boolean(req.body?.includeTrash) }).catch(() => {});
  }, 0);
  return res.status(202).json(job);
});

app.get('/api/admin/proxy-jobs/:id', async (req, res) => {
  const job = proxyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Proxy job not found' });
  return res.json(job);
});

app.get('/api/admin/proxy-jobs', async (_req, res) => {
  const jobs = Array.from(proxyJobs.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return res.json(jobs.slice(0, 20));
});

app.get('/api/admin/assets/suggest', async (req, res) => {
  try {
    const includeTrashRaw = String(req.query.includeTrash || '1').trim().toLowerCase();
    const includeTrash = !['0', 'false', 'no'].includes(includeTrashRaw);
    const suggestions = await queryAssetSuggestions({
      q: req.query.q,
      limit: req.query.limit,
      trash: includeTrash ? 'all' : 'active'
    });
    return res.json(
      suggestions.map((row) => ({
        id: row.id,
        title: row.title,
        fileName: row.fileName,
        type: row.type,
        inTrash: row.inTrash,
        updatedAt: row.updatedAt
      }))
    );
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest assets' });
  }
});

app.post('/api/admin/proxy-tools/run', async (req, res) => {
  try {
    const assetName = String(req.body?.assetName || '').trim();
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    if (!assetName) return res.status(400).json({ error: 'assetName is required' });
    if (!['thumbnail', 'image_thumbnail', 'image_preview', 'document_thumbnail', 'preview', 'proxy', 'replace_asset', 'replace_pdf', 'delete_asset'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be one of: thumbnail, image_thumbnail, image_preview, document_thumbnail, preview, proxy, replace_asset, replace_pdf, delete_asset' });
    }

    const like = `%${assetName}%`;
    const match = await pool.query(
      `
        SELECT *
        FROM assets
        WHERE title ILIKE $1 OR file_name ILIKE $1
        ORDER BY
          CASE
            WHEN LOWER(title) = LOWER($2) THEN 0
            WHEN LOWER(file_name) = LOWER($2) THEN 1
            ELSE 2
          END,
          updated_at DESC
        LIMIT 20
      `,
      [like, assetName]
    );
    if (!match.rowCount) return res.status(404).json({ error: 'Asset not found by name' });

    let row = match.rows[0];
    let info = {};
    if (assetEditLockService) {
      const lockResult = await assetEditLockService.assertWritable(req, row.id);
      if (!lockResult.ok) return assetEditLockService.sendLocked(res, lockResult);
    }

    if (mode === 'delete_asset') {
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
      const versionRows = (await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1', [row.id])).rows;
      const cleanupTargets = collectAssetCleanupPaths(row, versionRows);
      await pool.query('DELETE FROM asset_versions WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM asset_ocr_segments WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM assets WHERE id = $1', [row.id]);
      await removeAssetFromCollections(row.id);
      const cleanup = cleanupAssetFiles(cleanupTargets);
      await deleteAssetFromElastic(row.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.deleted',
        targetType: 'asset',
        targetId: row.id,
        targetTitle: String(row.title || row.file_name || row.id),
        details: {
          source: 'admin_proxy_tool',
          cleanupTargets: cleanupTargets.length,
          removedFiles: cleanup.removed.length
        }
      });
      info = {
        deleted: true,
        actor,
        removedFiles: cleanup.removed.length,
        cleanupErrors: cleanup.failed
      };
    } else if (mode === 'proxy') {
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Proxy generation is supported only for video assets' });
      }
      const rawBase64 = String(req.body?.fileBase64 || '').trim();
      if (rawBase64) {
        // Yönetim ekranında "Proxy üret" seçiliyken yeni dosya seçilmişse,
        // aynı işlem içinde önce ana videoyu bağlayıp sonra proxy üretiyoruz.
        const sanitizedBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
        let fileBuffer = null;
        try {
          fileBuffer = Buffer.from(sanitizedBase64, 'base64');
        } catch (_error) {
          return res.status(400).json({ error: 'Invalid fileBase64 payload' });
        }
        if (!fileBuffer || fileBuffer.length < 16) {
          return res.status(400).json({ error: 'Decoded file content is empty' });
        }
        const fileHash = computeBufferSha256(fileBuffer);

        const inputFileName = String(req.body?.fileName || row.file_name || `${row.id}.bin`).trim();
        const safeFileName = sanitizeFileName(inputFileName || row.file_name || `${row.id}.bin`);
        const nextMimeType = String(req.body?.mimeType || '').trim().toLowerCase() || inferMimeTypeFromFileName(safeFileName) || 'application/octet-stream';
        if (!isVideoCandidate({ mimeType: nextMimeType, fileName: safeFileName, declaredType: row.type })) {
          return res.status(400).json({ error: 'Selected source file must be a video file' });
        }

        const nowIso = new Date().toISOString();
        const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
        const currentHash = await getAssetStoredFileHash(row, { persist: true });
        if (!(fileHash && currentHash && fileHash === currentHash)) {
          const duplicateAsset = await findDuplicateAssetByHash(fileHash, { excludeAssetId: row.id });
          if (duplicateAsset) {
            return res.status(409).json({
              error: 'An identical asset file already exists',
              code: 'duplicate_asset_content',
              existingAsset: buildDuplicateAssetPayload(duplicateAsset)
            });
          }

          const safeBase = sanitizeFileName(path.basename(safeFileName, path.extname(safeFileName)) || `asset-${row.id}`);
          const extWithDot = path.extname(safeFileName) || '';
          const extSafe = extWithDot ? sanitizeFileName(extWithDot.replace(/^\./, '')) : '';
          const storedName = `${Date.now()}-${nanoid()}-${safeBase}${extSafe ? `.${extSafe}` : ''}`;
          const storage = getIngestStoragePath({ type: inferAssetType(row.type, nextMimeType), mimeType: nextMimeType, fileName: safeFileName });
          const absPath = path.join(storage.absoluteDir, storedName);
          const relativePath = path.join(storage.relativeDir, storedName);
          const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
          fs.writeFileSync(absPath, fileBuffer);

          const hadExistingSource = Boolean(String(row.media_url || '').trim() || String(row.source_path || '').trim());
          if (hadExistingSource) {
            const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [row.id]);
            const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
            await pool.query(
              `
                INSERT INTO asset_versions (
                  version_id, asset_id, label, note,
                  snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
                  actor_username, action_type, restored_from_version_id,
                  created_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              `,
              [
                nanoid(),
                row.id,
                `Asset Replace ${nextVersion}`,
                `File attached during proxy generation by ${actor}`,
                String(row.media_url || ''),
                String(row.source_path || ''),
                String(row.file_name || ''),
                String(row.mime_type || ''),
                String(row.thumbnail_url || ''),
                actor,
                'file_replace',
                null,
                nowIso
              ]
            );
          }

          const updated = await pool.query(
            `
              UPDATE assets
              SET media_url = $2,
                  source_path = $3,
                  file_name = $4,
                  mime_type = $5,
                  type = $6,
                  file_hash = $7,
                  proxy_url = '',
                  proxy_status = 'not_applicable',
                  thumbnail_url = '',
                  updated_at = $8
              WHERE id = $1
              RETURNING *
            `,
            [row.id, mediaUrl, absPath, safeFileName, nextMimeType, inferAssetType(row.type, nextMimeType), fileHash, nowIso]
          );
          row = updated.rows?.[0] || row;
        }
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) {
        return res.status(400).json({
          error: 'Source media not found. Choose a source video file in New Asset File, then run proxy generation again.'
        });
      }
      row = await ensureVideoProxyAndThumbnail(row, { forceProxy: true });
      info = {
        proxyUrl: resolveStoredUrl(row.proxy_url, 'proxies'),
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    } else if (mode === 'thumbnail') {
      const result = await regenerateVideoThumbnailForAsset(row, { timecode: req.body?.timecode });
      row = result.row;
      info = {
        thumbnailUrl: result.thumbnailUrl,
        timecode: result.timecodeSeconds == null ? '' : formatTimecode(result.timecodeSeconds)
      };
    } else if (mode === 'image_thumbnail') {
      if (!isImageAssetRow(row)) {
        return res.status(400).json({ error: 'Image thumbnail generation is supported only for image assets' });
      }
      const result = await regenerateImageThumbnailForRow(row);
      row = result.row;
      info = {
        previewUrl: result.previewUrl,
        thumbnailUrl: result.thumbnailUrl
      };
    } else if (mode === 'image_preview') {
      if (!isImageAssetRow(row)) {
        return res.status(400).json({ error: 'Image preview generation is supported only for image assets' });
      }
      const result = await ensureImagePreviewAndThumbnailForRow(row);
      row = result.row;
      info = {
        previewUrl: result.previewUrl,
        thumbnailUrl: result.thumbnailUrl
      };
    } else if (mode === 'document_thumbnail') {
      if (!isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Document thumbnail generation is supported only for document assets' });
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source file not found' });
      if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        row = await ensurePdfThumbnailForRow(row);
      } else {
        row = await ensureDocumentThumbnailForRow(row);
      }
      info = {
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    } else if (mode === 'preview') {
      if (!isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Preview generation is supported for document assets in this tool' });
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source file not found' });
      if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        row = await ensurePdfThumbnailForRow(row);
      } else {
        row = await ensureDocumentThumbnailForRow(row);
      }
      const preview = await extractPreviewContentFromFile(row, inputPath);
      info = {
        previewMode: String(preview.mode || 'text'),
        previewChars: Math.max(0, String(preview.html || preview.text || '').length),
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    } else if (mode === 'replace_asset' || mode === 'replace_pdf') {
      const rawBase64 = String(req.body?.fileBase64 || req.body?.pdfBase64 || '').trim();
      if (!rawBase64) return res.status(400).json({ error: 'fileBase64 is required for replace_asset' });
      const sanitizedBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
      let fileBuffer = null;
      try {
        fileBuffer = Buffer.from(sanitizedBase64, 'base64');
      } catch (_error) {
        return res.status(400).json({ error: 'Invalid fileBase64 payload' });
      }
      if (!fileBuffer || fileBuffer.length < 16) {
        return res.status(400).json({ error: 'Decoded file content is empty' });
      }
      const fileHash = computeBufferSha256(fileBuffer);

      const inputFileName = String(req.body?.fileName || row.file_name || `${row.id}.bin`).trim();
      const safeFileName = sanitizeFileName(inputFileName || row.file_name || `${row.id}.bin`);
      const nextMimeType = String(req.body?.mimeType || '').trim().toLowerCase() || inferMimeTypeFromFileName(safeFileName) || 'application/octet-stream';
      const currentFamily = getAssetFamily({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type });
      const newFamily = getAssetFamily({ mimeType: nextMimeType, fileName: safeFileName, declaredType: inferAssetType('', nextMimeType) });
      if (currentFamily === 'unknown' || newFamily === 'unknown' || currentFamily !== newFamily) {
        return res.status(400).json({
          error: 'New file type must match existing asset type',
          currentFamily,
          newFamily
        });
      }
      const generateThumbnail = Boolean(req.body?.generateThumbnail);
      const generatePreview = Boolean(req.body?.generatePreview);
      const nowIso = new Date().toISOString();
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
      const currentHash = await getAssetStoredFileHash(row, { persist: true });
      if (!(fileHash && currentHash && fileHash === currentHash)) {
        const duplicateAsset = await findDuplicateAssetByHash(fileHash, { excludeAssetId: row.id });
        if (duplicateAsset) {
          return res.status(409).json({
            error: 'An identical asset file already exists',
            code: 'duplicate_asset_content',
            existingAsset: buildDuplicateAssetPayload(duplicateAsset)
          });
        }
        const safeBase = sanitizeFileName(path.basename(safeFileName, path.extname(safeFileName)) || `asset-${row.id}`);
        const extWithDot = path.extname(safeFileName) || '';
        const extSafe = extWithDot ? sanitizeFileName(extWithDot.replace(/^\./, '')) : '';
        const storedName = `${Date.now()}-${nanoid()}-${safeBase}${extSafe ? `.${extSafe}` : ''}`;
        const storage = getIngestStoragePath({ type: inferAssetType(row.type, nextMimeType), mimeType: nextMimeType, fileName: safeFileName });
        const absPath = path.join(storage.absoluteDir, storedName);
        const relativePath = path.join(storage.relativeDir, storedName);
        const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
        fs.writeFileSync(absPath, fileBuffer);

        const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [row.id]);
        const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
        const nextFileName = safeFileName;
        await pool.query(
          `
            INSERT INTO asset_versions (
              version_id, asset_id, label, note,
              snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
              actor_username, action_type, restored_from_version_id,
              created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `,
          [
            nanoid(),
            row.id,
            `Asset Replace ${nextVersion}`,
            `File replaced via admin proxy tool by ${actor}`,
            mediaUrl,
            absPath,
            nextFileName,
            nextMimeType,
            '',
            actor,
            'file_replace',
            null,
            nowIso
          ]
        );
        await pool.query(
          `
            UPDATE assets
            SET media_url = $2,
                proxy_url = '',
                proxy_status = 'not_applicable',
                source_path = $3,
                file_name = $4,
                mime_type = $5,
                type = $6,
                file_hash = $7,
                thumbnail_url = '',
                updated_at = $8
            WHERE id = $1
            RETURNING *
          `,
          [row.id, mediaUrl, absPath, nextFileName, nextMimeType, inferAssetType(row.type, nextMimeType), fileHash, nowIso]
        ).then((result) => {
          row = result.rows[0] || row;
        });
      }
      let previewChars = 0;
      if (generateThumbnail) {
        if (isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
          const inputPath = resolveAssetInputPath(row);
          if (inputPath && fs.existsSync(inputPath)) {
            const previousThumbnailUrl = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
            const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
            const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, new Date());
            await generateVideoThumbnail(inputPath, thumbOut.absolutePath);
            const refreshed = await pool.query(
              `UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
              [row.id, thumbOut.publicUrl, new Date().toISOString()]
            );
            row = refreshed.rows?.[0] || row;
            await cleanupReplacedUploadUrls(row.id, previousThumbnailUrl, { ignoreSameAssetVersionRefs: true });
          }
        } else if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
          row = await ensurePdfThumbnailForRow(row);
        } else if (isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
          row = await ensureDocumentThumbnailForRow(row);
        } else if (isImageAssetRow(row)) {
          const result = await regenerateImageThumbnailForRow(row);
          row = result.row;
        }
      }
      if (generatePreview && isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        const inputPath = resolveAssetInputPath(row);
        if (inputPath && fs.existsSync(inputPath)) {
          const preview = await extractPreviewContentFromFile(row, inputPath);
          previewChars = Math.max(0, String(preview.html || preview.text || '').length);
        }
      } else if (generatePreview && isImageAssetRow(row)) {
        const result = await ensureImagePreviewAndThumbnailForRow(row);
        row = result.row;
      }
      await indexAssetToElastic(row.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.updated',
        targetType: 'asset',
        targetId: row.id,
        targetTitle: String(row.title || row.file_name || row.id),
        details: {
          source: 'admin_proxy_tool',
          mode,
          fileName: row.file_name,
          generatedThumbnail: generateThumbnail,
          generatedPreview: generatePreview
        }
      });
      info = {
        replaced: true,
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails'),
        generatedThumbnail: generateThumbnail,
        generatedPreview: generatePreview,
        previewChars
      };
    }

    return res.json({
      ok: true,
      mode,
      matchedCount: match.rowCount,
      assetId: row.id,
      assetTitle: String(row.title || row.file_name || row.id),
      ...info,
      asset: mapAssetRow(row)
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to run proxy tool action: ${String(error?.message || 'unknown error').slice(0, 260)}` });
  }
});

}

module.exports = { registerAdminRoutes };
