import type { Config } from '@netlify/functions'

const handler = async () => {
  await fetch(`${process.env.APP_URL}/api/cron/nudges`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
}
export default handler

export const config: Config = { schedule: '0 * * * *' }
