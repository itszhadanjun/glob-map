import { useTranslation, type Language } from '../i18n/TranslationContext'

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { lang, setLang, t } = useTranslation()

    if (!isOpen) return null

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(2px)'
        }}>
            <div style={{
                background: '#fff', borderRadius: '16px', padding: '24px', width: '320px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)', position: 'relative'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#111', textAlign: 'center' }}>
                    {t('settings.title')}
                </h3>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#555', textAlign: 'center' }}>
                        {t('settings.language')}
                    </label>
                    <select
                        value={lang}
                        onChange={(e) => setLang(e.target.value as Language)}
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: '8px',
                            border: '1px solid #ddd', fontSize: '14px', background: '#f9f9f9',
                            cursor: 'pointer', outline: 'none', color: '#333'
                        }}
                    >
                        <option value="en">English</option>
                        <option value="zh_tw">繁體中文 (台灣)</option>
                    </select>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        width: '100%', padding: '10px', background: '#2b7de9', color: '#fff',
                        border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(43, 125, 233, 0.3)'
                    }}
                >
                    {t('common.close')}
                </button>
            </div>
        </div>
    )
}