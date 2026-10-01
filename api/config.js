// Expose uniquement les infos PUBLIQUES de Supabase (l'anon key est conçue pour être publique).
// Les valeurs vivent dans Vercel → Settings → Environment Variables.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    anon: process.env.SUPABASE_ANON_KEY || ''
  });
}
