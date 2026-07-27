import { describe, it, expect } from 'vitest'
import { WA_TEMPLATES, WA_TEMPLATE_KEYS, renderWaTemplate, waLink, WA_SOFT_LIMIT } from '../src/data/waTemplates.js'

const FULL = {
  cliente: 'Stiven', banco: 'BHD', dealer: 'Auto Centro', monto: 'RD$ 1,800,000',
  fecha: '29 jul 2026', vehiculo: 'Toyota Corolla 2021', link: 'https://autord.do/f/abc123',
}

describe('the nine templates', () => {
  it('covers every message the brief asks for', () => {
    expect(WA_TEMPLATE_KEYS).toEqual([
      'solicitud_recibida', 'solicitud_en_revision', 'banco_solicita_info',
      'preaprobacion_lista', 'aprobacion_lista', 'aprobacion_vence_pronto',
      'aprobacion_expirada', 'vehiculo_no_disponible', 'dealer_respondio',
    ])
    expect(WA_TEMPLATE_KEYS).toHaveLength(9)
  })

  it('every template renders and has a human label', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      const body = renderWaTemplate(key, FULL)
      expect(body.length, key).toBeGreaterThan(20)
      expect(WA_TEMPLATES[key].label, key).toBeTruthy()
    }
  })

  it('uses the exact wording the brief fixed for the info request', () => {
    expect(renderWaTemplate('banco_solicita_info', FULL)).toBe(
      'Hola Stiven, BHD necesita completar información para continuar tu solicitud de financiamiento. Completa aquí: https://autord.do/f/abc123',
    )
  })

  it('addresses the client by name in every message', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(renderWaTemplate(key, FULL), key).toContain('Stiven')
    }
  })

  it('stays under the wa.me prefill limit', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(renderWaTemplate(key, FULL).length, key).toBeLessThan(WA_SOFT_LIMIT)
    }
  })
})

describe('refuses to produce a message that should not be sent', () => {
  // Queueing '' would send a blank WhatsApp to a real person.
  it('throws on an unknown template instead of returning empty', () => {
    expect(() => renderWaTemplate('no_existe', FULL)).toThrow(/desconocida/)
    expect(() => renderWaTemplate(undefined, FULL)).toThrow()
  })

  // "Hola undefined" is worse than no message, and cannot be taken back.
  it('throws when a required variable is missing', () => {
    expect(() => renderWaTemplate('banco_solicita_info', { cliente: 'Stiven', banco: 'BHD' }))
      .toThrow(/Faltan datos/)
    expect(() => renderWaTemplate('preaprobacion_lista', { ...FULL, monto: null })).toThrow(/monto/)
  })

  it('treats blank and whitespace-only values as missing', () => {
    expect(() => renderWaTemplate('solicitud_recibida', { cliente: '' })).toThrow(/Faltan datos/)
    expect(() => renderWaTemplate('solicitud_recibida', { cliente: '   ' })).toThrow(/Faltan datos/)
  })

  it('never leaks the words undefined or null into a body', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      const body = renderWaTemplate(key, FULL)
      expect(body, key).not.toMatch(/undefined|null/)
    }
  })

  it('leaves no unreplaced placeholder', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(renderWaTemplate(key, FULL), key).not.toMatch(/\{\w+\}/)
    }
  })
})

describe('waLink', () => {
  it('strips formatting from the phone number', () => {
    expect(waLink('+1 (809) 969-8833', 'hola')).toContain('wa.me/18099698833')
  })

  it('encodes the body so accents and spaces survive', () => {
    const link = waLink('18099698833', 'informació n & más')
    expect(link).toContain('%20')
    expect(link).not.toContain(' ')
    expect(decodeURIComponent(link.split('text=')[1])).toBe('informació n & más')
  })

  it('returns null without a usable number rather than a broken link', () => {
    expect(waLink('', 'hola')).toBeNull()
    expect(waLink(null, 'hola')).toBeNull()
    expect(waLink('sin-numero', 'hola')).toBeNull()
  })
})
