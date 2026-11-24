import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { InkwellApi } from '../shared/types'

const inv = <T>(channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const api: InkwellApi = {
  platform: process.platform,
  openFile: () => inv('file:open'),
  readFile: (p) => inv('file:read', p),
  saveFile: (p, c) => inv('file:save', p, c),
  saveFileAs: (s, c) => inv('file:saveAs', s, c),
  openFolder: () => inv('folder:open'),
  readDir: (p) => inv('dir:read', p),
  statFile: (p) => inv('file:stat', p),
  createFile: (d, n) => inv('file:create', d, n),
  renamePath: (p, n) => inv('path:rename', p, n),
  trashPath: (p) => inv('path:trash', p),
  listAll: (r) => inv('folder:listAll', r),
  searchFolder: (r, q) => inv('folder:search', r, q),
  saveImage: (d, n, data) => inv('image:save', d, n, data),
  readDataUrl: (p) => inv('file:dataUrl', p),
  exportFile: (o) => inv('export:save', o),
  exportPdf: (o) => inv('export:pdf', o),
  getLaunchFile: () => inv('app:launchFile'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  setSticky: (on) => inv('window:sticky', on),
  setDirty: (d) => ipcRenderer.send('doc:dirty', d),
  nativeRun: (r) => inv('native:run', r),
  nativeStop: (id) => ipcRenderer.send('native:stop', id),
  setSplash: (on) => ipcRenderer.send('win:splash', on),
  appVersion: () => inv('app:version'),
  updateStatus: () => inv('update:status'),
  updateCheck: () => inv('update:check'),
  updateDownload: () => inv('update:download'),
  updateInstall: () => ipcRenderer.send('update:install'),
  onUpdate: (cb) => {
    const handler = (_e: unknown, s: import('../shared/update').UpdateStatus) => cb(s)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  forceClose: () => ipcRenderer.send('win:forceClose'),
  setChrome: (c) => ipcRenderer.send('chrome:set', c),
  getMaterialSupport: () => inv('window:materialSupport'),
  setMaterial: (o) => ipcRenderer.send('window:setMaterial', o),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  notesRead: (p) => inv('notes:read', p),
  notesWrite: (p, j) => inv('notes:write', p, j),
  inboxSetup: (on) => inv('inbox:setup', on),
  inboxShow: () => inv('inbox:show'),
  inboxPath: () => inv('inbox:path'),
  inboxAppend: (t) => inv('inbox:append', t),
  inboxClose: () => ipcRenderer.send('inbox:close'),
  refsRead: (p) => inv('refs:read', p),
  refsWrite: (p, j) => inv('refs:write', p, j),
  locksRead: (p) => inv('locks:read', p),
  locksWrite: (p, j) => inv('locks:write', p, j),
  editRole: (r) => ipcRenderer.send('win:edit', r),
  closeWindow: () => ipcRenderer.send('win:close'),
  openExternal: (u) => ipcRenderer.send('shell:external', u),
  reveal: (p) => ipcRenderer.send('shell:reveal', p),
  historySave: (p, c) => inv('history:save', p, c),
  historyList: (p) => inv('history:list', p),
  historyRead: (p, t) => inv('history:read', p, t),
  historyMilestone: (p, c, t) => inv('history:milestone', p, c, t),
  historyReadAll: (p, n) => inv('history:readAll', p, n),
  historyIndex: () => inv('history:index'),
  historyReadKey: (k, t) => inv('history:readKey', k, t),
  capsuleCreate: (t, x, u) => inv('capsule:create', t, x, u),
  capsuleList: () => inv('capsule:list'),
  capsuleOpen: (id) => inv('capsule:open', id),
  capsuleDelete: (id) => inv('capsule:delete', id),
  drawerRead: () => inv('drawer:read'),
  drawerWrite: (b) => inv('drawer:write', b),
  aiRewrite: (r) => inv('ai:rewrite', r),
  aiTest: (r) => inv('ai:test', r),
  aiBalance: (r) => inv('ai:balance', r),
  exportImage: (o) => inv('export:image', o),
  clipWatch: (on) => inv('clip:watch', on),
  onClip: (cb) => {
    const handler = (_e: unknown, text: string) => cb(text)
    ipcRenderer.on('clip', handler)
    return () => ipcRenderer.removeListener('clip', handler)
  },
  onMenu: (cb) => {
    const handler = (_e: unknown, action: string) => cb(action)
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
