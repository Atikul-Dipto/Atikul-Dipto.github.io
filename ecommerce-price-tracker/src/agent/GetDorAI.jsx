import { useEffect, useState } from 'react'

const EXTENSION_SOURCE = 'https://github.com/Atikul-Dipto/Atikul-Dipto.github.io/tree/main/ecommerce-price-tracker/extension'

// The two ways to use DorAI outside this page: installed on a phone, where
// Share in the Daraz or Cartup app sends a product here (Android), and the
// browser extension, which shows it on the stores' own product pages.
export default function GetDorAI() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches ?? false)
  const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    // Chrome and Edge offer installing; the page decides when to ask.
    const offer = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const done = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', offer)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('beforeinstallprompt', offer)
      window.removeEventListener('appinstalled', done)
    }
  }, [])

  return (
    <section className="get-dorai" id="get">
      <h2>Use DorAI while you shop</h2>
      <div className="get-dorai-grid">
        <div>
          <h3>On your phone</h3>
          {installed ? (
            <p>DorAI is installed. In the Daraz or Cartup app, tap Share on a product and choose DorAI to compare it.</p>
          ) : iPhone ? (
            <p>
              In Safari, tap Share, then <b>Add to Home Screen</b>. To compare a product, copy its link in the Daraz or
              Cartup app and paste it into the box above.
            </p>
          ) : (
            <>
              <p>
                Install DorAI as an app. Then in the Daraz or Cartup app, tap Share on any product and choose DorAI to
                see it on both stores.
              </p>
              {installPrompt ? (
                <button
                  type="button"
                  className="install-btn"
                  onClick={async () => {
                    installPrompt.prompt()
                    await installPrompt.userChoice.catch(() => null)
                    setInstallPrompt(null)
                  }}
                >
                  Install DorAI
                </button>
              ) : (
                <p>In Chrome's menu, choose “Add to Home screen” or “Install app”.</p>
              )}
            </>
          )}
        </div>
        <div>
          <h3>On a computer</h3>
          <p>
            The DorAI browser extension shows the same product on the other store, cheaper trusted sellers and the
            lowest price we've seen, right on Daraz and Cartup product pages.
          </p>
          <p>
            It's in testing: load it into Chrome or Edge from{' '}
            <a href={EXTENSION_SOURCE} target="_blank" rel="noreferrer">
              its source
            </a>{' '}
            (Extensions → Developer mode → Load unpacked).
          </p>
        </div>
      </div>
    </section>
  )
}
