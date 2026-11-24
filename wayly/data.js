/* Wayly — sample data + generators. ALL flights, hotels and prices are SAMPLE DATA generated
   deterministically for the demo. Attraction notes are short, general-knowledge summaries. */
(function (g) {
  'use strict';

  const CITIES = {
    toronto: {
      id: 'toronto', name: 'Toronto', country: 'Canada', code: 'YYZ', lat: 43.6532, lng: -79.3832, tz: -5,
      airport: { name: 'Toronto Pearson International Airport', lat: 43.6777, lng: -79.6248 },
      emergency: '911 for police, fire and ambulance',
      attractions: [
        { id: 'cn-tower', name: 'CN Tower', aka: ['cn tower'], area: 'Downtown', lat: 43.6426, lng: -79.3871, minutes: 90,
          intro: 'A 553-metre tower on the Toronto skyline.',
          scenic: 'Look up and the tower seems to pull a thin silver needle through the clouds. From the observation level, Lake Ontario spreads out like a pale blue sheet, the islands lie close to shore, and the downtown towers shimmer below your feet. On a clear day the view stretches a very long way.',
          stops: [
            { title: 'A tower built to broadcast', text: 'The CN Tower was completed in 1976. It was built to solve a practical problem: tall new buildings were blocking radio and television signals. At about five hundred and fifty-three metres, it held the title of the world\'s tallest free-standing structure for more than thirty years.' },
            { title: 'Up in the air', text: 'High-speed elevators carry visitors to the observation levels in under a minute. Step onto the glass floor if you dare. Look straight down and you will see the railway lines, the stadium roof and the toy-sized streets far below.' },
          ] },
        { id: 'st-lawrence-market', name: 'St. Lawrence Market', aka: ['lawrence market', 'st lawrence', 'st. lawrence'], area: 'Old Town', lat: 43.6487, lng: -79.3715, minutes: 75,
          intro: 'A historic food market in the old town.',
          scenic: 'Inside the brick hall, the air is warm and full of sound: vendors calling out, cheese counters, mountains of fresh bread and the smell of coffee. Sunlight pours through tall windows onto crowded stalls piled with produce, fish and spices.',
          stops: [
            { title: 'A market with deep roots', text: 'Markets have stood on this spot since the early eighteen hundreds. Today the South Market is a place where locals buy their meat, fish, cheese and produce from the same families year after year.' },
            { title: 'What to try', text: 'A local favourite is the peameal bacon sandwich: cornmeal-crusted back bacon, grilled and tucked into a soft bun. Take it outside, find a bench, and watch the city go by.' },
          ] },
        { id: 'casa-loma', name: 'Casa Loma', aka: ['casa loma'], area: 'Midtown', lat: 43.6780, lng: -79.4094, minutes: 120,
          intro: 'A Gothic Revival castle on a hill.',
          scenic: 'Casa Loma rises from the hillside like a castle from a storybook, with turrets, towers and stone walls. Inside, dark wood, stained glass and long corridors lead to secret passages and a tower with sweeping city views.',
          stops: [
            { title: 'A castle in the city', text: 'Casa Loma was built between nineteen eleven and nineteen fourteen for Sir Henry Pellatt, a financier and military man who dreamed of owning a castle. The Gothic Revival design includes ninety-eight rooms, towers and even a tunnel.' },
            { title: 'Gardens and views', text: 'Walk out to the gardens in warmer months, with fountains and terraces framing the castle. From the towers, you can look out over the city rooftops to the lake on a clear day.' },
          ] },
      ],
    },
    paris: {
      id: 'paris', name: 'Paris', country: 'France', code: 'CDG', lat: 48.8566, lng: 2.3522, tz: 1,
      airport: { name: 'Paris Charles de Gaulle Airport', lat: 49.0097, lng: 2.5479 },
      emergency: '112 (EU emergency number), 17 police, 15 medical, 18 fire',
      attractions: [
        { id: 'eiffel-tower', name: 'Eiffel Tower', aka: ['eiffel'], area: '7th arrondissement', lat: 48.8584, lng: 2.2945, minutes: 120,
          intro: 'The iron icon of Paris.',
          scenic: 'The tower\'s lattice of iron rises in a graceful curve above the Champ de Mars lawns. At dusk the iron glows golden, and on the hour it sparkles with thousands of lights. From the top, the Seine ribbons through rooftops of cream stone and grey zinc.',
          stops: [
            { title: 'Built for a world\'s fair', text: 'The Eiffel Tower was built for the eighteen eighty-nine World\'s Fair in Paris, by the company of engineer Gustave Eiffel. It was meant to stand for twenty years, but it proved so useful as a radio mast that it was kept.' },
            { title: 'Tower by the numbers', text: 'The tower is about three hundred and thirty metres tall including its antennas. You can climb the stairs to the second level or take the lifts to the top. Come at sunset for the view and stay for the lights.' },
          ] },
        { id: 'louvre', name: 'Louvre Museum', aka: ['louvre'], area: '1st arrondissement', lat: 48.8606, lng: 2.3376, minutes: 180,
          intro: 'A former royal palace turned great museum.',
          scenic: 'A vast palace of pale stone surrounds a courtyard where a glass pyramid catches the sky. Inside, painted ceilings, marble halls and grand staircases lead to galleries filled with centuries of art.',
          stops: [
            { title: 'From fortress to palace to museum', text: 'The Louvre began as a medieval fortress, became a royal palace, and opened as a public museum during the French Revolution in seventeen ninety-three. Its collection spans thousands of years.' },
            { title: 'The pyramid and the Mona Lisa', text: 'The glass pyramid at the entrance, designed by architect I. M. Pei, opened in nineteen eighty-nine. Inside, the most famous painting is the Mona Lisa by Leonardo da Vinci. Arrive early, and leave time to wander beyond the famous names.' },
          ] },
        { id: 'notre-dame', name: 'Notre-Dame de Paris', aka: ['notre dame', 'notre-dame'], area: 'Île de la Cité', lat: 48.8530, lng: 2.3499, minutes: 60,
          intro: 'The Gothic cathedral on the Seine.',
          scenic: 'On a small island in the Seine, twin towers rise above a facade crowded with carved saints and kings. Flying buttresses arch around the back like the ribs of a great ship, and the river slides past below.',
          stops: [
            { title: 'A cathedral of centuries', text: 'Construction of Notre-Dame began in eleven sixty-three and continued for generations. It is a masterpiece of Gothic architecture, with stained glass, sculpture and soaring stone vaults.' },
            { title: 'Fire and restoration', text: 'In April twenty nineteen, a fire badly damaged the cathedral. A major restoration followed, and the building has been reopened to visitors. Walk around the outside to see the facade, the flying buttresses and the riverside gardens.' },
          ] },
      ],
    },
    tokyo: {
      id: 'tokyo', name: 'Tokyo', country: 'Japan', code: 'HND', lat: 35.6762, lng: 139.6503, tz: 9,
      airport: { name: 'Tokyo Haneda Airport', lat: 35.5494, lng: 139.7798 },
      emergency: '110 police, 119 fire and ambulance',
      attractions: [
        { id: 'senso-ji', name: 'Senso-ji Temple', aka: ['senso', 'sensoji', 'asakusa'], area: 'Asakusa', lat: 35.7148, lng: 139.7967, minutes: 90,
          intro: 'Tokyo\'s oldest temple.',
          scenic: 'Beneath a giant red lantern at the Kaminarimon gate, crowds stream towards the temple along a lane of small shops selling snacks and souvenirs. Incense smoke drifts across a courtyard, and the temple\'s great roof glows red and gold.',
          stops: [
            { title: 'The oldest temple in Tokyo', text: 'Senso-ji is Tokyo\'s oldest temple. Tradition dates its founding to the year six forty-five, and it is dedicated to Kannon, the bodhisattva of compassion. Enter through the Kaminarimon, the Thunder Gate, with its enormous red lantern.' },
            { title: 'Nakamise street', text: 'The Nakamise shopping street leads to the main hall, lined with stalls offering rice crackers, sweet treats and traditional crafts. At the incense burner, visitors waft the smoke over themselves, a custom believed to bring good health.' },
          ] },
        { id: 'shibuya-crossing', name: 'Shibuya Crossing', aka: ['shibuya'], area: 'Shibuya', lat: 35.6595, lng: 139.7005, minutes: 45,
          intro: 'One of the world\'s busiest pedestrian crossings.',
          scenic: 'When the lights turn red in every direction, a wave of people surges into the intersection from all sides, weaving past each other beneath giant video screens and neon signs. From the windows above, it looks like an orderly, ever-changing tide.',
          stops: [
            { title: 'The scramble', text: 'At Shibuya Crossing, traffic stops in every direction at once and pedestrians cross in all directions, including diagonally. At busy times, thousands of people cross with each change of the light.' },
            { title: 'Hachiko and the view', text: 'Nearby, a bronze statue honours Hachiko, the loyal dog who waited for his owner at the station. For a good view of the crossing, look for the windows and terraces in the buildings facing it.' },
          ] },
        { id: 'meiji-shrine', name: 'Meiji Shrine', aka: ['meiji'], area: 'Shibuya', lat: 35.6764, lng: 139.6993, minutes: 90,
          intro: 'A forest shrine in the middle of the city.',
          scenic: 'Through a towering wooden torii gate, a wide gravel path leads deep into a hushed forest. The city\'s noise falls away, replaced by rustling leaves and crunching gravel, as the path opens towards the quiet shrine.',
          stops: [
            { title: 'A shrine for an emperor', text: 'Meiji Shrine was dedicated in nineteen twenty to the spirits of Emperor Meiji and Empress Shoken. It was created to honour the emperor who guided Japan into the modern era.' },
            { title: 'A forest made by hand', text: 'The shrine sits within a forest of about a hundred thousand trees, donated from across Japan and planted when the shrine was built. Follow the path slowly and notice how quickly the city seems to disappear.' },
          ] },
      ],
    },
    newyork: {
      id: 'newyork', name: 'New York', country: 'United States', code: 'JFK', lat: 40.7128, lng: -74.0060, tz: -5,
      airport: { name: 'John F. Kennedy International Airport', lat: 40.6413, lng: -73.7781 },
      emergency: '911 for police, fire and ambulance',
      attractions: [
        { id: 'statue-of-liberty', name: 'Statue of Liberty', aka: ['statue of liberty', 'liberty'], area: 'Liberty Island', lat: 40.6892, lng: -74.0445, minutes: 180,
          intro: 'A gift from France, standing in the harbour.',
          scenic: 'From the ferry, the statue grows larger as you approach: a green copper figure with a torch held high, her crown catching the sun against the harbour. Behind her, the Manhattan skyline stands in the haze.',
          stops: [
            { title: 'A gift of friendship', text: 'The Statue of Liberty was a gift from the people of France to the United States, dedicated in eighteen eighty-six. The sculptor was Frédéric Auguste Bartholdi, and the internal iron framework was designed by Gustave Eiffel.' },
            { title: 'Why she is green', text: 'The statue is made of thin sheets of copper. When new, it was a shiny brown, but over the years the copper reacted with the air to form the green patina you see today.' },
          ] },
        { id: 'central-park', name: 'Central Park', aka: ['central park'], area: 'Manhattan', lat: 40.7829, lng: -73.9654, minutes: 120,
          intro: 'An 843-acre park in the heart of Manhattan.',
          scenic: 'Step through the stone walls and the city hum softens. Winding paths lead past rocky outcrops, a lake with rowboats, and wide lawns where people picnic. Beyond the treetops, the towers of Fifth Avenue and Central Park West frame the sky.',
          stops: [
            { title: 'A park by design', text: 'Central Park is a designed landscape. Frederick Law Olmsted and Calvert Vaux won the design competition with their Greensward plan, and construction began in eighteen fifty-eight. It covers about eight hundred and forty-three acres.' },
            { title: 'Where to wander', text: 'Try Bethesda Terrace and its fountain, the tree-lined Mall, and the lake. In warm weather, you can rent a rowboat. In autumn, the trees turn gold and red.' },
          ] },
        { id: 'brooklyn-bridge', name: 'Brooklyn Bridge', aka: ['brooklyn bridge'], area: 'Lower Manhattan', lat: 40.7061, lng: -73.9969, minutes: 60,
          intro: 'A historic suspension bridge across the East River.',
          scenic: 'Two stone towers with pointed arches rise from the river, hung with a web of steel cables that sweep down to the deck. Walking across, you feel the vibration of traffic below and see the skyline of Lower Manhattan glowing behind you.',
          stops: [
            { title: 'A feat of engineering', text: 'The Brooklyn Bridge opened in eighteen eighty-three. John Roebling designed it, and after his death, his son Washington Roebling and Washington\'s wife Emily Warren Roebling saw the project through to completion.' },
            { title: 'Walking the bridge', text: 'A pedestrian walkway runs above the traffic. Start from the Brooklyn side for the best view of the skyline ahead, and take your time to look at the granite towers and the cable pattern.' },
          ] },
      ],
    },
    london: {
      id: 'london', name: 'London', country: 'United Kingdom', code: 'LHR', lat: 51.5072, lng: -0.1276, tz: 0,
      airport: { name: 'London Heathrow Airport', lat: 51.4700, lng: -0.4543 },
      emergency: '999 or 112 for police, fire and ambulance',
      attractions: [
        { id: 'tower-of-london', name: 'Tower of London', aka: ['tower of london'], area: 'Tower Hill', lat: 51.5081, lng: -0.0759, minutes: 150,
          intro: 'A fortress, palace and prison by the Thames.',
          scenic: 'Ancient stone walls and round towers stand beside the Thames, with Tower Bridge rising just beyond. Inside, the pale White Tower dominates a courtyard where ravens hop across the grass and guards in red and black uniforms stand watch.',
          stops: [
            { title: 'A fortress with a long story', text: 'After conquering England in ten sixty-six, William the Conqueror began building fortifications in London. The White Tower dates from the late eleventh century. Over the centuries, the Tower served as a royal palace, a prison and a treasury.' },
            { title: 'Ravens and jewels', text: 'The Tower is home to the Crown Jewels, and to a group of ravens, kept by tradition. The Yeoman Warders, often called Beefeaters, live on site and lead tours full of stories.' },
          ] },
        { id: 'big-ben', name: 'Big Ben and the Elizabeth Tower', aka: ['big ben', 'elizabeth tower', 'westminster'], area: 'Westminster', lat: 51.5007, lng: -0.1246, minutes: 45,
          intro: 'The clock tower beside the Houses of Parliament.',
          scenic: 'The tower\'s golden stone glows warmly against the sky, its clock face lit like a moon on winter evenings. Beside it, the Houses of Parliament stretch along the river, and red buses roll across Westminster Bridge.',
          stops: [
            { title: 'Bell, clock and tower', text: 'Big Ben is actually the name of the great bell inside the tower, though many people use it for the whole building. The tower was completed in eighteen fifty-nine, and in twenty twelve it was renamed the Elizabeth Tower to mark Queen Elizabeth the Second\'s Diamond Jubilee.' },
            { title: 'Best vantage points', text: 'Stand on Westminster Bridge for the classic view, or on the riverside path beside the Thames. Listen for the chimes on the hour.' },
          ] },
        { id: 'british-museum', name: 'British Museum', aka: ['british museum'], area: 'Bloomsbury', lat: 51.5194, lng: -0.1270, minutes: 150,
          intro: 'A great museum of world history and culture.',
          scenic: 'Beyond the columns of the Greek Revival facade, the Great Court opens under a vast glass roof, a white-and-gold sweep of light. Galleries lead off in every direction to mummies, marbles, and treasures from across the world.',
          stops: [
            { title: 'A museum for everyone', text: 'The British Museum was founded in seventeen fifty-three and opened to the public in seventeen fifty-nine. It holds millions of objects from cultures across the world. General admission is free.' },
            { title: 'Highlights', text: 'Look for the Rosetta Stone, which helped unlock the meaning of Egyptian hieroglyphs, along with the Egyptian mummies and the sculptures from the Parthenon in Athens. With so much to see, choose a few favourites and enjoy them slowly.' },
          ] },
      ],
    },
  };

  const rad = d => d * Math.PI / 180;
  const km = (a, b) => {
    const R = 6371, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = seed => { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  // Real instant for a wall-clock time in a place with a fixed UTC offset (standard time; illustrative).
  const utc = (dateStr, hh, mm, tz) => { const [y, m, d] = dateStr.split('-').map(Number); return Date.UTC(y, m - 1, d, hh, mm) - tz * 3600000; };
  const offsetKm = (p, distKm, bearing) => { const b = rad(bearing); return { lat: p.lat + (distKm * Math.cos(b)) / 111.32, lng: p.lng + (distKm * Math.sin(b)) / (111.32 * Math.cos(rad(p.lat))) }; };

  const AIRLINES = [['Skyline Demo Air', 'SD'], ['Aurora Demo Airways', 'AD'], ['Demo Pacific', 'DP']];
  const SLOTS = [[7, 15], [11, 40], [17, 30], [21, 10]];

  function flightOptions(fromId, toId, dateStr) {
    const a = CITIES[fromId], b = CITIES[toId], d = km(a, b), r = rng(hash(fromId + toId + dateStr));
    return SLOTS.map((s, i) => {
      const al = AIRLINES[(i + Math.floor(r() * 3)) % 3];
      const stops = (d > 7500 && i === 2) || (i === 3 && d > 3000) ? 1 : 0;
      const durMin = Math.round(d / (800 + r() * 60) * 60 + 45 + stops * 150);
      const price = Math.max(70, Math.round((90 + d * 0.085 * (0.85 + r() * 0.5) - stops * 35) / 5) * 5);
      const depTs = utc(dateStr, s[0], s[1], a.tz);
      return { id: `f${i}`, airline: al[0], number: `${al[1]} ${100 + Math.floor(r() * 880)}`, from: fromId, to: toId, depTs, arrTs: depTs + durMin * 60000, durMin, stops, price };
    });
  }

  const HOTEL_NAMES = ['Grand Demo Hotel', 'Hotel Demo Central', 'Demo Riverside Inn', 'The Demo Boutique'];
  const AMENITIES = ['Free Wi-Fi', 'Breakfast', 'Gym', 'Airport shuttle', 'Spa', '24h front desk'];
  function hotelOptions(cityId) {
    const c = CITIES[cityId], r = rng(hash('hotel' + cityId));
    return HOTEL_NAMES.map((n, i) => {
      const pos = offsetKm(c, 0.4 + r() * 1.8, r() * 360);
      return {
        id: `h${i}`, name: `${n} ${c.name}`, stars: 3 + Math.floor(r() * 3), rating: (7.8 + r() * 1.6).toFixed(1),
        price: Math.round((85 + r() * 235) / 5) * 5, lat: pos.lat, lng: pos.lng,
        address: `${10 + Math.floor(r() * 190)} Sample Street, ${c.name}`, checkIn: '15:00', checkOut: '11:00',
        amenities: AMENITIES.filter(() => r() > 0.5).slice(0, 4),
      };
    });
  }

  function transferOptions(cityId, hotel) {
    const c = CITIES[cityId], d = km(c.airport, hotel);
    const taxi = Math.round((4 + d * 2.1) * 2) / 2;
    return [
      { id: 'taxi', name: 'Taxi', icon: '🚕', fare: taxi, mins: Math.round(12 + d * 1.8), note: 'Door to door' },
      { id: 'ride', name: 'Rideshare', icon: '🚗', fare: Math.round(taxi * 0.85 * 2) / 2, mins: Math.round(14 + d * 1.8), note: 'Book in your rideshare app' },
      { id: 'transit', name: 'Public transit', icon: '🚆', fare: Math.round((3 + d * 0.12) * 2) / 2, mins: Math.round(25 + d * 3.2), note: 'Cheapest, one or two changes' },
    ].map(t => Object.assign(t, { km: Math.round(d * 10) / 10 }));
  }

  g.WD = { CITIES, km, hash, rng, utc, flightOptions, hotelOptions, transferOptions, offsetKm };
})(window);
