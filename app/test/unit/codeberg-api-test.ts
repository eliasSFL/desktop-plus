import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getAPIEndpoint,
  getCodebergAPIEndpoint,
  getEndpointForRepository,
  getHTMLURL,
  isTrustedRemoteHost,
  toIAPIEmailFromCodeberg,
  toIAPIFullIdentityFromCodeberg,
  toIAPIFullRepositoryFromCodeberg,
  toIAPIIssueFromCodeberg,
  toIAPIMentionableUserFromCodeberg,
  toIAPIOrganizationFromCodeberg,
  toIAPIPullRequestFromCodeberg,
  toIAPIRefStatusItemFromCodeberg,
  toIAPIRepositoryFromCodeberg,
  ICodebergAPIRepository,
  ICodebergAPIUser,
} from '../../src/lib/api'
import { isCodeberg, isGHES } from '../../src/lib/endpoint-capabilities'
import { deduceRepositoryType } from '../../src/models/github-repository'
import { Account } from '../../src/models/account'

const user: ICodebergAPIUser = {
  id: 42,
  login: 'octocat',
  full_name: 'Octo Cat',
  email: 'octocat@example.com',
  avatar_url: 'https://codeberg.org/avatars/abc',
  html_url: 'https://codeberg.org/octocat',
}

const repository: ICodebergAPIRepository = {
  id: 1,
  name: 'test-repo',
  full_name: 'octocat/test-repo',
  owner: user,
  private: true,
  fork: false,
  html_url: 'https://codeberg.org/octocat/test-repo',
  clone_url: 'https://codeberg.org/octocat/test-repo.git',
  ssh_url: 'ssh://git@codeberg.org/octocat/test-repo.git',
  default_branch: 'main',
  archived: false,
  has_issues: true,
  updated_at: '2026-07-08T10:00:00+02:00',
}

describe('Codeberg API', () => {
  describe('endpoints', () => {
    it('detects the codeberg endpoint', () => {
      assert.equal(isCodeberg(getCodebergAPIEndpoint()), true)
      assert.equal(isCodeberg('https://codeberg.org'), false)
    })

    it('is not mistaken for GitHub Enterprise Server', () => {
      assert.equal(isGHES(getCodebergAPIEndpoint()), false)
    })

    it('maps clone urls to the API endpoint', () => {
      assert.equal(
        getEndpointForRepository('https://codeberg.org/octocat/test-repo.git'),
        getCodebergAPIEndpoint()
      )
    })

    it('maps the API endpoint to the html url', () => {
      assert.equal(getHTMLURL(getCodebergAPIEndpoint()), 'https://codeberg.org')
    })

    it('normalizes the API endpoint', () => {
      assert.equal(
        getAPIEndpoint(getCodebergAPIEndpoint()),
        getCodebergAPIEndpoint()
      )
    })

    it('treats codeberg.org as a trusted remote host', () => {
      assert.equal(
        isTrustedRemoteHost('https://codeberg.org/octocat/test-repo.git'),
        true
      )
    })

    it('deduces the repository type from the html url', () => {
      assert.equal(
        deduceRepositoryType('https://codeberg.org/octocat/test-repo'),
        'codeberg'
      )
    })

    it('computes the account api type from the endpoint', () => {
      const account = new Account(
        'octocat',
        getCodebergAPIEndpoint(),
        'token',
        '',
        0,
        [],
        '',
        42,
        'Octo Cat'
      )
      assert.equal(account.apiType, 'codeberg')
    })
  })

  describe('identity mapping', () => {
    it('maps full_name to name', () => {
      const identity = toIAPIFullIdentityFromCodeberg(user)
      assert.equal(identity.login, 'octocat')
      assert.equal(identity.name, 'Octo Cat')
      assert.equal(identity.email, 'octocat@example.com')
    })

    it('maps an empty full_name to null', () => {
      const identity = toIAPIFullIdentityFromCodeberg({
        ...user,
        full_name: '',
        email: '',
      })
      assert.equal(identity.name, null)
      assert.equal(identity.email, null)
    })

    it('maps mentionable users', () => {
      const mentionable = toIAPIMentionableUserFromCodeberg(user)
      assert.equal(mentionable.login, 'octocat')
      assert.equal(mentionable.name, 'Octo Cat')
      assert.equal(mentionable.email, 'octocat@example.com')
    })
  })

  describe('email mapping', () => {
    it('defaults visibility to public', () => {
      const email = toIAPIEmailFromCodeberg({
        email: 'octocat@example.com',
        verified: true,
        primary: false,
      })
      assert.equal(email.email, 'octocat@example.com')
      assert.equal(email.verified, true)
      assert.equal(email.primary, false)
      assert.equal(email.visibility, 'public')
    })
  })

  describe('organization mapping', () => {
    it('uses the username as login', () => {
      const org = toIAPIOrganizationFromCodeberg({
        id: 7,
        name: 'forgejo',
        username: 'forgejo',
        avatar_url: 'https://codeberg.org/avatars/def',
      })
      assert.equal(org.login, 'forgejo')
      assert.equal(org.id, 7)
    })
  })

  describe('repository mapping', () => {
    it('maps updated_at to pushed_at', () => {
      const repo = toIAPIRepositoryFromCodeberg(repository)
      assert.equal(repo.name, 'test-repo')
      assert.equal(repo.owner.login, 'octocat')
      assert.equal(repo.private, true)
      assert.equal(repo.pushed_at, '2026-07-08T10:00:00+02:00')
      assert.equal(repo.clone_url, 'https://codeberg.org/octocat/test-repo.git')
    })

    it('maps the fork parent', () => {
      const fork = toIAPIFullRepositoryFromCodeberg({
        ...repository,
        fork: true,
        parent: repository,
      })
      assert.equal(fork.fork, true)
      assert.equal(fork.parent?.name, 'test-repo')
    })

    it('passes permissions through when present', () => {
      const repo = toIAPIFullRepositoryFromCodeberg({
        ...repository,
        permissions: { admin: false, push: false, pull: true },
      })
      assert.deepEqual(repo.permissions, {
        admin: false,
        push: false,
        pull: true,
      })
    })

    it('assumes full permissions when absent', () => {
      const repo = toIAPIFullRepositoryFromCodeberg(repository)
      assert.deepEqual(repo.permissions, {
        admin: true,
        push: true,
        pull: true,
      })
    })
  })

  describe('pull request mapping', () => {
    it('maps head and base refs', () => {
      const pr = toIAPIPullRequestFromCodeberg({
        number: 123,
        title: 'Add feature',
        body: 'Description',
        state: 'open',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
        user,
        head: { ref: 'feature-branch', sha: 'abc123', repo: repository },
        base: { ref: 'main', sha: 'def456', repo: repository },
        draft: true,
      })
      assert.equal(pr.number, 123)
      assert.equal(pr.state, 'open')
      assert.equal(pr.draft, true)
      assert.equal(pr.head.ref, 'feature-branch')
      assert.equal(pr.head.repo?.name, 'test-repo')
      assert.equal(pr.base.ref, 'main')
    })

    it('tolerates a deleted head repository', () => {
      const pr = toIAPIPullRequestFromCodeberg({
        number: 1,
        title: 'From deleted fork',
        body: '',
        state: 'closed',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
        user,
        head: { ref: 'gone', sha: 'abc123', repo: null },
        base: { ref: 'main', sha: 'def456', repo: repository },
      })
      assert.equal(pr.head.repo, null)
    })
  })

  describe('issue mapping', () => {
    it('maps the issue fields', () => {
      const issue = toIAPIIssueFromCodeberg({
        number: 9,
        title: 'Something broke',
        state: 'open',
        updated_at: '2026-07-02T00:00:00Z',
      })
      assert.equal(issue.number, 9)
      assert.equal(issue.state, 'open')
    })
  })

  describe('commit status mapping', () => {
    it('reads the state from the status field', () => {
      const item = toIAPIRefStatusItemFromCodeberg({
        id: 1,
        status: 'failure',
        context: 'ci/woodpecker',
        description: 'Build failed',
        target_url: 'https://ci.codeberg.org/build/1',
      })
      assert.equal(item.state, 'failure')
      assert.equal(item.context, 'ci/woodpecker')
      assert.equal(item.target_url, 'https://ci.codeberg.org/build/1')
    })

    it('maps warning to success', () => {
      const item = toIAPIRefStatusItemFromCodeberg({
        id: 2,
        status: 'warning',
        context: 'lint',
        description: '',
        target_url: '',
      })
      assert.equal(item.state, 'success')
    })

    it('resolves relative target urls against codeberg.org', () => {
      const item = toIAPIRefStatusItemFromCodeberg({
        id: 3,
        status: 'success',
        context: '/ release (push)',
        description: 'Has been skipped',
        target_url: '/forgejo/forgejo/actions/runs/175139/jobs/0',
      })
      assert.equal(
        item.target_url,
        'https://codeberg.org/forgejo/forgejo/actions/runs/175139/jobs/0'
      )
    })

    it('maps an empty target url to null', () => {
      const item = toIAPIRefStatusItemFromCodeberg({
        id: 4,
        status: 'pending',
        context: 'deploy',
        description: '',
        target_url: '',
      })
      assert.equal(item.target_url, null)
    })
  })
})
