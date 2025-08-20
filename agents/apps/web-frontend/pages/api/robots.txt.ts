import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Sitemap: https://alii-website.onrender.com/sitemap.xml",
  ].join("\n");
  res.setHeader("Content-Type", "text/plain");
  res.status(200).end(body);
}

