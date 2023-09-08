import { Octokit } from '@octokit/rest';
import { consola } from 'consola';
import 'dotenv/config';
import { camelCase } from 'lodash-es';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { formatAgentJSON } from './check.mjs';
import { agentsDir, githubHomepage } from './const.mjs';

class AutoSubmit {
  owner = 'lobehub';
  repo = 'lobe-chat-agents';
  issueNumber = process.env.ISSUE_NUMBER;

  constructor() {
    this.octokit = new Octokit({ auth: `token ${process.env.GH_TOKEN}` });
  }

  async run() {
    try {
      await this.submit()
    } catch (e){
      await this.createComment(
        [
          '> **🚨 Auto Check Fail:**',
          '```bash',
          e?.message,
          '```',
        ].join('\n'),
      );
      consola.error(e)
    }
  }

  async submit() {
    const issue = await this.getIssue();
    if (!issue) return;
    consola.info(`Get issues #${this.issueNumber}`);

    const agent = await this.formatIssue(issue);
    const comment = this.genCommentMessage(agent);
    const agentName = camelCase(agent.identifier);
    const fileName = agentName + '.json';
    const filePath = resolve(agentsDir, fileName);

    // check same name
    if (existsSync(filePath)) {
      await this.createComment(
        [
          `> **🚨 Auto Check Fail:** Same name exist <${`${githubHomepage}/blob/main/agents/${fileName}`}>`,
          '- Rename your agent identifier',
          '- Add issue label `🤖 Agent PR` to the current issue',
          '- Wait for automation to regenerate',
          '---',
          comment,
        ].join('\n'),
      );
      await this.removeLabels('🤖 Agent PR');
      await this.addLabels('🚨 Auto Check Fail');
      consola.error('Auto Check Fail');
      return;
    }

    // comment in issues
    await this.createComment(comment);
    await this.addLabels('✅ Auto Check Pass');
    consola.info(`Auto Check Pass`);

    // commit and pull request
    this.gitCommit(filePath, agent, agentName);
    consola.info('Commit to', `agent/${agentName}`);

    await this.createPullRequest(
      agentName,
      agent.author,
      [comment, `[@${agent.author}](${agent.homepage}) (resolve #${this.issueNumber})`].join('\n'),
    );
    consola.success('Create PR');
  }

  gitCommit(filePath, agent, agentName) {
    execSync('git diff');
    execSync('git config --global user.name "lobehubbot"');
    execSync('git config --global user.email "i@lobehub.com"');
    execSync('git pull');
    execSync(`git checkout -b agent/${agentName}`);

    // generate file
    writeFileSync(filePath, JSON.stringify(agent, null, 2), {
      encoding: 'utf8',
    });
    consola.info('Generate file', filePath);

    // i18n
    execSync('pnpm run format');

    // commit
    execSync('git add -A');
    execSync(`git commit -m "✨ feat(agent): Add ${agentName} (#${this.issueNumber})"`);
    execSync(`git push origin agent/${agentName}`);
  }

  genCommentMessage(json) {
    return [
      '🤖 Automatic generated agent config file',
      '```json',
      JSON.stringify(json, null, 2),
      '```',
    ].join('\n');
  }

  async createPullRequest(agentName, author, body) {
    const { owner, repo, octokit, issueNumber } = this;
    const pr = await octokit.pulls.create({
      base: 'main',
      body,
      head: `agent/${agentName}`,
      owner: owner,
      repo: repo,
      title: `[AgentSubmit] ${agentName} @${author}`,
    });
  }
  async getIssue() {
    const { owner, repo, octokit, issueNumber } = this;
    const issue = await octokit.issues.get({
      issue_number: issueNumber,
      owner,
      repo,
    });
    return issue.data;
  }

  async addLabels(label) {
    const { owner, repo, octokit, issueNumber } = this;
    await octokit.issues.addLabels({
      issue_number: issueNumber,
      labels: [label],
      owner,
      repo,
    });
  }

  async removeLabels(label) {
    const { owner, repo, octokit, issueNumber } = this;
    const issue = await this.getIssue();

    const baseLabels = issue.labels.map(({ name }) => name);
    const removeLabels = baseLabels.filter((name) => name === label);

    for (const label of removeLabels) {
      await octokit.issues.removeLabel({
        issue_number: issueNumber,
        name: label,
        owner,
        repo,
      });
    }
  }

  async createComment(body) {
    const { owner, repo, octokit, issueNumber } = this;
    const { data } = await octokit.issues.createComment({
      body,
      issue_number: issueNumber,
      owner,
      repo,
    });
    return data.id;
  }

  markdownToJson(markdown) {
    const lines = markdown.split('\n');
    const json = {};

    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      if (line.startsWith('###')) {
        if (currentKey && currentValue) {
          json[currentKey] = currentValue.trim();
          currentValue = '';
        }
        currentKey = line.replace('###', '').trim();
      } else {
        currentValue += line + '\n';
      }
    }

    if (currentKey && currentValue) {
      json[currentKey] = currentValue.trim();
    }

    json.tags = json.tags.replaceAll('，', ',').replaceAll(', ', ',').split(',');

    return json;
  }

  async formatIssue(data) {
    const json = this.markdownToJson(data.body);
    const agent = {
      author: data.user.login,
      config: {
        systemRole: json.systemRole,
      },
      homepage: data.user.html_url,
      identifier: json.identifier,
      locale: json.locale,
      meta: {
        avatar: json.avatar,
        description: json.description,
        tags: json.tags,
        title: json.title,
      },
    };

    return await formatAgentJSON(agent);
  }
}

const autoSubmit = new AutoSubmit();

await autoSubmit.run();
