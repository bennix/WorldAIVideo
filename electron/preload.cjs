const { contextBridge, ipcRenderer } = require("electron");
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("worldmodel", {
  snapshot: invoke("snapshot"),
  settings: invoke("settings"),
  connection: invoke("connection"),
  newChat: invoke("new-chat"),
  pinChat: invoke("pin-chat"),
  deleteChats: invoke("delete-chats"),
  deleteDoc: invoke("delete-doc"),
  importFiles: invoke("import"),
  referenceAsset: invoke("reference-asset"),
  pick: invoke("pick"),
  removeAttachment: invoke("remove-attachment"),
  run: invoke("run"),
  stop: invoke("stop"),
  export: invoke("export"),
  download: invoke("download"),
  copy: invoke("copy"),
  openSource: invoke("open-source"),
  external: invoke("external"),
  subscribe: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("update", listener);
    return () => ipcRenderer.removeListener("update", listener);
  },
});
