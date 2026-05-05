import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listStories, getStory } from './storyService';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  // Final-diff Copilot review fix: vi.stubGlobal does not auto-restore
  // between tests, so the fetch stub would otherwise leak into other
  // tests that share this jsdom global. Explicitly unstub.
  vi.unstubAllGlobals();
});

describe('storyService', () => {
  it('listStories returns the array on a 200 response', async () => {
    const dto = [
      { slug: 's1', title: 'S1', category: 'AG', subCategory: 'X',
        estReadMinutes: 3, fleschReadingEase: 80,
        questionCount: 8, modelMemoryUsed: false, stateAwarePreamble: false },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => dto,
    });

    const result = await listStories();

    expect(result).toEqual(dto);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/stories');
  });

  it('listStories returns [] on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });

    const result = await listStories();
    expect(result).toEqual([]);
  });

  it('listStories returns [] on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const result = await listStories();
    expect(result).toEqual([]);
  });

  it('getStory returns the detail DTO on success', async () => {
    const dto = {
      slug: 'three-branches',
      title: 'The Three Branches',
      category: 'American Government',
      subCategory: 'System of Government',
      bodyMarkdown: '## Hi\n\nBody [1].',
      sources: [{ id: 1, title: 'Wiki', url: 'https://example.com', type: 'wikipedia', supportSnippet: 'snip' }],
      estReadMinutes: 5,
      fleschReadingEase: 80,
      modelMemoryUsed: false,
      stateAwarePreamble: true,
      questions: [],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => dto,
    });

    const result = await getStory('three-branches');
    expect(result).toEqual(dto);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/stories/three-branches');
  });

  it('getStory passes stateId through as a query parameter', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    });

    await getStory('three-branches', 5);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/stories/three-branches?stateId=5');
  });

  it('getStory returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    });

    const result = await getStory('does-not-exist');
    expect(result).toBeNull();
  });

  it('getStory returns null on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const result = await getStory('three-branches');
    expect(result).toBeNull();
  });

  it('getStory percent-encodes the slug', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    });

    await getStory('weird/slug?');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/stories/weird%2Fslug%3F');
  });
});
