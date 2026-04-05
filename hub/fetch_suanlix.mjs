import https from 'https';

const COOKIE = 'session=MTc3NTMxNTEwN3xEWDhFQVFMX2dBQUJFQUVRQUFEX2pQLUFBQVVHYzNSeWFXNW5EQWdBQm5OMFlYUjFjd05wYm5RRUFnQUNCbk4wY21sdVp3d0hBQVZuY205MWNBWnpkSEpwYm1jTUJnQUVkblpwY0FaemRISnBibWNNQkFBQ2FXUURhVzUwQkFJQVJnWnpkSEpwYm1jTUNnQUlkWE5sY201aGJXVUdjM1J5YVc1bkRBZ0FCbXhwY0dWdVp3WnpkSEpwYm1jTUJnQUVjbTlzWlFOcGJuUUVBZ0FDfJ34cGIYcN_zzKvVjHQum_x2wuSFDfwC4RU24AbxqhpI';
const BASE_URL = 'token.suanlix.com';

const HEADERS = {
  'Cookie': COOKIE,
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Origin': `https://${BASE_URL}`,
  'Referer': `https://${BASE_URL}/`,
};

function fetchApi(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: path,
      method: 'GET',
      headers: HEADERS
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('--- Fetching from Suanlix ---');

  const groupsRes = await fetchApi('/api/group/');
  console.log('Groups Result:', JSON.stringify(groupsRes.data, null, 2).substring(0, 500) + '...');

  const ratioRes = await fetchApi('/api/option/?key=GroupRatio');
  console.log('\nGroupRatio Result:', JSON.stringify(ratioRes.data, null, 2).substring(0, 500) + '...');

  const pricingRes = await fetchApi('/api/pricing');
  // Just print the first few models' pricing to avoid flooding the console
  const pricingData = pricingRes.data?.data || pricingRes.data;
  console.log('\nPricing Models Count:', Array.isArray(pricingData) ? pricingData.length : 'Unknown');
  if (Array.isArray(pricingData)) {
    console.log('First 2 Models:', JSON.stringify(pricingData.slice(0, 2), null, 2));
  } else {
    console.log('Pricing Raw:', JSON.stringify(pricingRes.data, null, 2).substring(0, 500) + '...');
  }
}

main();
