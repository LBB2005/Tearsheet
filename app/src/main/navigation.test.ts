import { describe, expect, it } from 'vitest'

import { navigationAction } from './navigation'

describe('navigationAction (design item 47)', () => {
  it('turns a flag link into the note box', () => {
    expect(navigationAction('tearsheet://flag/rep-20261105T192809Z-edadc1:business.2')).toEqual({
      kind: 'flag',
      claimId: 'rep-20261105T192809Z-edadc1:business.2'
    })
  })

  it('turns a re-read link into an engine request', () => {
    expect(navigationAction('tearsheet://reread/0000320193-26-000026')).toEqual({
      kind: 'reread',
      accession: '0000320193-26-000026'
    })
  })

  it('turns an open link into a view and an optional item', () => {
    expect(navigationAction('tearsheet://open/factors')).toEqual({ kind: 'open', view: 'factors', item: null })
    expect(navigationAction('tearsheet://open/metrics/operating_margin')).toEqual({
      kind: 'open',
      view: 'metrics',
      item: 'operating_margin'
    })
    expect(navigationAction('tearsheet://open/table-valuation/2')).toEqual({
      kind: 'open',
      view: 'table-valuation',
      item: '2'
    })
  })

  it('turns a download link into the file to make and the report it comes from', () => {
    for (const format of ['pdf', 'pptx', 'xlsx'] as const) {
      expect(navigationAction(`tearsheet://download/${format}/rep-20261108T074914Z-d3b6d3`)).toEqual({
        kind: 'download',
        format,
        reportId: 'rep-20261108T074914Z-d3b6d3'
      })
    }
  })

  it.each([
    'tearsheet://download/docx/rep-1',
    'tearsheet://download/pdf',
    'tearsheet://download/pdf/',
    'tearsheet://download/pdf/rep-1/extra',
    'tearsheet://download/pdf/..%2F..%2Fetc',
    'tearsheet://download/pdf/rep%201',
    'tearsheet://download/pdf/rep-1?x=1',
    'tearsheet://download/pdf/rep-1#top'
  ])('blocks a download link it does not know: %s', (address) => {
    expect(navigationAction(address)).toEqual({ kind: 'blocked', url: address })
  })

  it('opens https links in the normal browser', () => {
    expect(navigationAction('https://www.sec.gov/Archives/edgar/data/320193/x-index.htm')).toEqual({
      kind: 'external',
      url: 'https://www.sec.gov/Archives/edgar/data/320193/x-index.htm'
    })
  })

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://example.com/',
    'data:text/html,<script>alert(1)</script>',
    'tearsheet://flag/<script>',
    'tearsheet://reread/not-an-accession',
    'tearsheet://delete/everything',
    'tearsheet://open/',
    'tearsheet://open/settings',
    'tearsheet://open/factors/a/b',
    'tearsheet://open/table-',
    'tearsheet://open/table-Valuation',
    'tearsheet://open/factors/<script>',
    'tearsheet://open/factors?x=1',
    'tearsheet://open/factors#x',
    `tearsheet://open/factors/${'x'.repeat(65)}`,
    'not a url'
  ])('blocks %s', (address) => {
    expect(navigationAction(address).kind).toBe('blocked')
  })
})
