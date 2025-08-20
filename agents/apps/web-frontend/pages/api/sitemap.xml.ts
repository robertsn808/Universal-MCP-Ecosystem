import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.WEB_BASE_URL || "https://alii-website.onrender.com";
  const urls = ["/", "/contact", "/hours"].map((p) => `${base}${p}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${u}</loc></url>`) 
    .join("\n")}\n</urlset>`;
  res.setHeader("Content-Type", "application/xml");
  res.status(200).end(xml);
}

