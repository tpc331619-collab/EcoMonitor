async function test() {
  const apiKey = 'CWA-0D7DE138-4998-4EC0-A1B0-CBA9278ACEAB';
  // 桃園市各鄉鎮市區預報
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-005?Authorization=${apiKey}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Success:", data.success);
    if (data.records && data.records.locations && data.records.locations[0]) {
      const locations = data.records.locations[0].location || [];
      const locNames = locations.map(l => l.locationName);
      console.log("Available Locations:", locNames.join(", "));
      
      const target = "觀音區";
      const found = locations.find(l => l.locationName === target);
      if (found) {
        console.log("Found:", target);
        const elements = found.weatherElement.map(e => e.elementName);
        console.log("Elements:", elements.join(", "));
      } else {
        console.log("Not found:", target);
      }
    } else {
      console.log("Data structure unexpected:", JSON.stringify(data).substring(0, 300));
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
