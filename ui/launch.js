{
const { t } = globalThis.DucoroI18n;
(async () => {
  const open = async () => {
    try {
      DucoroI18n.setText(document.getElementById("launch-state"),"正在连接 Magpie 页面接口…");
      const theme = await Promise.race([magpie.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("连接超时")),10000))])
      globalThis.DucoroI18n.applyDocument("zh-CN")
      DucoroI18n.setText(document.getElementById("launch-state"),"正在读取插件配置并打开控制台…");
      const options = await magpie.options.get() ?? {}
      const port = Number(options.servicePort) || 3487
      location.replace(magpie.service ? new URL(magpie.service, location.href).href : `http://127.0.0.1:${port}/`)
    } catch {
      DucoroI18n.applyDocument(document.documentElement.lang)
      DucoroI18n.setText(document.getElementById('launch-state'), t('Ducoro 页面未就绪，请重新打开。'))
      document.getElementById('launch-retry').hidden = false
    }
  }
  document.getElementById('launch-retry').addEventListener('click',open)
  await open()
})()

}
