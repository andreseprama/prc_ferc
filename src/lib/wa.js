// Abertura do WhatsApp compatível com Safari e Chrome, sem páginas em branco.
export function openWhatsApp(text, tel) {
  const enc = encodeURIComponent(text)
  const web = tel ? `https://wa.me/${tel}?text=${enc}` : `https://wa.me/?text=${enc}`
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (mobile) {
    // esquema direto: abre a app do WhatsApp sem navegar a página
    window.location.href = tel ? `whatsapp://send?phone=${tel}&text=${enc}` : `whatsapp://send?text=${enc}`
    // recurso caso o WhatsApp não esteja instalado
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        const w = window.open(web, '_blank')
        if (!w) window.location.href = web
      }
    }, 2500)
  } else {
    window.open(web, '_blank')
  }
}
