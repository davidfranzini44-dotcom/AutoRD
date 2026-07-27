// Contact-detail helpers, kept free of the Supabase client so they can be unit
// tested and imported from pure modules like the financing checklist.

// A passwordless account gets a deterministic wa<digits>@autord.local address so
// Supabase Auth has something unique to key on. It is not a real inbox: never
// show it as the client's email, and never count it as "email completado".
export const isPlaceholderEmail = (e) => !e || /@autord\.local$/i.test(String(e))
export const realEmail = (e) => (isPlaceholderEmail(e) ? null : e)
