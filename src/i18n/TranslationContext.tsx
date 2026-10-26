import React, { createContext, useContext, useState } from 'react'
import en from '../locales/en.json'
import zh_tw from '../locales/zh_tw.json'

export type Language = 'en' | 'zh_tw'
type Translations = typeof en

const dictionaries: Record<Language, Translations> = { en, zh_tw }

interface TranslationContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: (path: string, params?: Record<string, string | number>) => string;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined)

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<Language>(() => {
        const saved = localStorage.getItem('app_lang')
        return (saved === 'zh_tw' || saved === 'en') ? saved : 'en'
    })

    const setLang = (newLang: Language) => {
        setLangState(newLang)
        localStorage.setItem('app_lang', newLang)
    }

    const t = (path: string, params?: Record<string, string | number>): string => {
        const keys = path.split('.')

        const getVal = (dict: any) => {
            let curr = dict
            for (const key of keys) {
                if (curr && typeof curr === 'object' && key in curr) {
                    curr = curr[key]
                } else {
                    return null
                }
            }
            return typeof curr === 'string' ? curr : null
        }

        let result = getVal(dictionaries[lang])
        if (!result && lang !== 'en') {
            result = getVal(dictionaries['en']) // Fallback to English
        }

        const template = result || path

        if (params) {
            return Object.keys(params).reduce((acc, key) => {
                return acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(params[key]))
            }, template)
        }

        return template
    }

    return (
        <TranslationContext.Provider value={{ lang, setLang, t }}>
            {children}
        </TranslationContext.Provider>
    )
}

export const useTranslation = () => {
    const context = useContext(TranslationContext)
    if (!context) throw new Error('useTranslation must be used within a TranslationProvider')
    return context
}