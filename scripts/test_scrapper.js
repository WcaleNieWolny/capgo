const gplay = require('google-play-scraper')

async function main() {
  const res = await gplay.list({
    category: gplay.category.APPLICATION,
    collection: gplay.collection.TOP_FREE,
    limit: 1000,
    fullDetail: false,
    // num: limit + skip,
  })
  console.log(res.length)
}
main()
