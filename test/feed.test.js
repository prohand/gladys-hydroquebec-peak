import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEED_ERRORS, FeedClient, FeedError, parseFeed } from '../src/hydroquebec/feed.js';
import { NOVEMBER, WINTER, fakeFetch, fixtureText } from './helpers/feed.js';

const parse = (name) => parseFeed(JSON.parse(fixtureText(name)));

test('the feed of 2026-11-10 parses as Hydro-Québec served it', () => {
  const feed = parse(NOVEMBER);
  assert.equal(feed.offers.length, 39);
  assert.ok(feed.offers.includes('Credit hivernal Residentiel (CPC-D)'));
  assert.equal(feed.events.length, 8);
  assert.equal(feed.skipped, 0);
  assert.equal(feed.lastExecution, '2026-11-10 04:21:24');
  const [first] = feed.events;
  assert.equal(first.code, 'OEA');
  assert.equal(first.slot, 'PM');
  assert.equal(first.sector, 'Affaires');
  assert.equal(first.start.toISOString(), '2026-06-11T20:00:00.000Z', 'the -04:00 offset is kept');
});

test('winter events carry the offer code inside their label', () => {
  const feed = parse(WINTER);
  const cpcd = feed.events.filter((event) => event.code === 'CPC-D');
  assert.equal(cpcd.length, 5);
  assert.equal(cpcd[0].offer, 'Credit hivernal Residentiel (CPC-D)');
  assert.equal(cpcd[0].start.toISOString(), '2025-01-08T11:00:00.000Z');
  assert.equal(cpcd[0].id, 'cpc-d|2025-01-08T11:00:00.000Z|2025-01-08T14:00:00.000Z');
});

test('events are sorted, and the same peak published twice is kept once', () => {
  const event = (start, end) => ({
    offre: 'CPC-D',
    dateDebut: start,
    dateFin: end,
    plageHoraire: 'AM',
  });
  const feed = parseFeed({
    offresDisponibles: ['CPC-D'],
    evenements: [
      event('2025-01-09T06:00:00-05:00', '2025-01-09T09:00:00-05:00'),
      event('2025-01-08T06:00:00-05:00', '2025-01-08T09:00:00-05:00'),
      event('2025-01-08T06:00:00-05:00', '2025-01-08T09:00:00-05:00'),
    ],
  });
  assert.equal(feed.events.length, 2);
  assert.ok(feed.events[0].start < feed.events[1].start);
});

test('a malformed event is skipped and counted, never fatal', () => {
  const feed = parseFeed({
    offresDisponibles: ['CPC-D', '', 12],
    evenements: [
      {
        offre: 'CPC-D',
        dateDebut: '2025-01-08T06:00:00-05:00',
        dateFin: '2025-01-08T09:00:00-05:00',
      },
      // No offset: would be read in the container's zone, five hours off.
      { offre: 'CPC-D', dateDebut: '2025-01-08T06:00:00', dateFin: '2025-01-08T09:00:00' },
      {
        offre: 'CPC-D',
        dateDebut: '2025-01-08T09:00:00-05:00',
        dateFin: '2025-01-08T06:00:00-05:00',
      },
      { dateDebut: '2025-01-08T06:00:00-05:00', dateFin: '2025-01-08T09:00:00-05:00' },
      null,
    ],
  });
  assert.deepEqual(feed.offers, ['CPC-D']);
  assert.equal(feed.events.length, 1);
  assert.equal(feed.skipped, 4);
  assert.equal(feed.events[0].slot, 'AM', 'derived from the start when not published');
});

test('a document that is not the feed is refused', () => {
  assert.throws(
    () => parseFeed([]),
    (err) => err instanceof FeedError && err.code === FEED_ERRORS.PARSE,
  );
  assert.throws(() => parseFeed({ evenements: [] }), /offresDisponibles/);
});

test('the client revalidates its copy with the ETag', async () => {
  const fetch = fakeFetch();
  const client = new FeedClient({ fetch });
  const first = await client.read();
  assert.equal(first.changed, true);
  const second = await client.read();
  assert.equal(second.changed, false, '304: nothing new');
  assert.equal(second.feed, first.feed);
  assert.equal(
    fetch.calls[1].headers['if-none-match'],
    fetch.calls.length && `"${fetch.body.length}"`,
  );
});

test('HTTP, network and JSON failures are told apart', async () => {
  const fetch = fakeFetch({ status: 503 });
  const client = new FeedClient({ fetch });
  await assert.rejects(client.read(), (err) => err.code === FEED_ERRORS.HTTP && err.status === 503);

  fetch.error = new Error('getaddrinfo ENOTFOUND');
  await assert.rejects(client.read(), (err) => err.code === FEED_ERRORS.NETWORK);

  fetch.error = null;
  fetch.status = 200;
  fetch.body = '<html>maintenance</html>';
  await assert.rejects(client.read(), (err) => err.code === FEED_ERRORS.PARSE);
  assert.equal(client.feed, null, 'nothing half-read is kept');
});
