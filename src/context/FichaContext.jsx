import { createContext, useContext, useState, useCallback } from 'react'

// Holds the vehicle currently shown in the slide-in ficha drawer.
// open(vehicle) shows it; close() hides it. Rendered once in the buyer Layout.
const FichaContext = createContext(null)

export function FichaProvider({ children }) {
  const [vehicle, setVehicle] = useState(null)
  const open = useCallback((v) => setVehicle(v), [])
  const close = useCallback(() => setVehicle(null), [])
  return <FichaContext.Provider value={{ vehicle, open, close }}>{children}</FichaContext.Provider>
}

export function useFicha() {
  return useContext(FichaContext) || { vehicle: null, open: () => {}, close: () => {} }
}
