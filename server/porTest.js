require('dotenv').config({
  path: require('path').join(__dirname, '../.env')
})
const fetch = require('node-fetch')

const POR_KEY = process.env.POR_API_KEY
const POR_BASE = 'https://api.pointofrental.com/v1/apikey'

async function test() {
  console.log('Key present:', !!POR_KEY)
  console.log('Key length:', POR_KEY ? POR_KEY.length : 0)

  const endpoints = [
    '/work-orders',
    '/workorders',
    '/WorkOrders'
  ]

  for (const ep of endpoints) {
    try {
      console.log(`\nTrying: ${POR_BASE}${ep}`)
      const res = await fetch(`${POR_BASE}${ep}`, {
        headers: {
          'X-API-Key': POR_KEY,
          'Content-Type': 'application/json'
        }
      })
      console.log('Status:', res.status)
      const text = await res.text()
      console.log('Response:', text.substring(0, 1000))
    } catch (err) {
      console.log('Error:', err.message)
    }
  }
}

test()
