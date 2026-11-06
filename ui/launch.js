{
const { t } = globalThis.DucoroI18n;
(async () => {
  const open = async () => {
    try {
      const theme = await magpie.ready
      globalThis.DucoroI18n.applyDocument(theme.lang)
      const options = await magpie.options.get() ?? {}
      const port = Number(options.servicePort) || 3487
      location.replace(magpie.service ? new URL(magpie.service, location.href).href : `http://127.0.0.1:${port}/`)
    } catch {
      DucoroI18n.setText(document.getElementById('launch-state'), t('Ducoro 页面未就绪，请重新打开。'))
      document.getElementById('launch-retry').hidden = false
    }
  }
  document.getElementById('launch-retry').addEventListener('click',open)
  await open()
})()

}
