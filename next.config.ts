import type { NextConfig } from 'next'

const config: NextConfig = {
  // Resume uploads go through a server action. The default limit is 1 MB, resumes are limited to 4 MB in the app.
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
}

export default config
