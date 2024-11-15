// ==UserScript==
// @name         Bitbucket Server Multiple Pull Request Templates
// @namespace    https://github.com/kellyselden
// @version      3
// @description  Support multiple pull request templates
// @updateURL    https://raw.githubusercontent.com/kellyselden/bitbucket-server-multiple-pull-request-templates/main/meta.js
// @downloadURL  https://raw.githubusercontent.com/kellyselden/bitbucket-server-multiple-pull-request-templates/main/user.js
// @author       Kelly Selden
// @license      MIT
// @supportURL   https://github.com/kellyselden/bitbucket-server-multiple-pull-request-templates
// @match        http*://*bitbucket*/projects/*/repos/*/pull-requests*
// ==/UserScript==
'use strict';

// The /pull-requests route is shared between list and create.
if (new URL(document.URL).searchParams.get('create') === null) {
  return;
}

let container = document.getElementById('compare-and-create-container');

function getEditor() {
  return container.querySelector('.CodeMirror').CodeMirror;
}

function listener(event) {
  let editor = getEditor();

  editor.setValue(event.target.value);
}

function stripExtension(fileName) {
  let i = fileName.lastIndexOf('.');

  if (i === -1 || i === 0) {
    return fileName;
  }

  return fileName.substring(0, i);
}

const selectId = 'custom-pull-request-templates-select';

async function run(formBodySide) {
  let templatesPath = '.pull-request-templates';

  let fromBranch = container.querySelector('.ref-lozenge').textContent;

  let { project, repo } = document.URL.match(/\/projects\/(?<project>\w+)\/repos\/(?<repo>\S+)\/pull-requests/).groups;

  let response = await fetch(`/rest/api/1.0/projects/${project}/repos/${repo}/files/${templatesPath}?at=${fromBranch}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  let data = await response.json();

  if (data.errors) {
    for (let error of data.errors) {
      if (error.exceptionName === 'com.atlassian.bitbucket.content.NoSuchPathException') {
        console.log(error);
      } else {
        console.error(error);
      }
    }

    return;
  }

  let pullRequestTemplates = await Promise.all(data.values.map(async file => {
    let response = await fetch(`/rest/api/1.0/projects/${project}/repos/${repo}/raw/${templatesPath}/${file}?at=${fromBranch}`);

    let text = await response.text();

    return {
      file,
      text,
    }
  }));

  pullRequestTemplates = pullRequestTemplates.reduce((pullRequestTemplates, { file, text }) => {
    let name = stripExtension(file);

    pullRequestTemplates[name] = text;

    return pullRequestTemplates;
  }, {});

  let extension = document.createElement('div');

  extension.id = 'custom-pull-request-templates';
  extension.classList.add('create-pull-request-form-extension');

  let labelElement = document.createElement('label');
  labelElement.htmlFor = selectId;
  labelElement.textContent = 'Pull request template: ';

  let selectElement = document.createElement('select');
  selectElement.id = selectId;

  let defaultKey = 'default';
  let defaultValue = pullRequestTemplates[defaultKey] ?? editor.getValue();

  let editor = getEditor();

  let option = document.createElement('option');
  option.value = defaultValue;
  option.textContent = defaultKey;
  selectElement.appendChild(option);

  editor.setValue(defaultValue);

  delete pullRequestTemplates[defaultKey];

  for (let [team, template] of Object.entries(pullRequestTemplates)) {
    let option = document.createElement('option');
    option.value = template;
    option.textContent = team;
    selectElement.appendChild(option);
  }

  selectElement.addEventListener('change', listener);

  extension.appendChild(labelElement);
  extension.appendChild(selectElement);

  formBodySide.appendChild(extension);
}

function find(node, query) {
  if (node.matches?.(query)) {
    return node;
  } else {
    return node.querySelector?.(query);
  }
}

new MutationObserver(mutationsList => {
  for (let mutation of mutationsList) {
    if (mutation.type === 'childList') {
      for (let node of mutation.addedNodes) {
        let formBodySide = find(node, '.form-body-side');

        if (formBodySide) {
          run(formBodySide);
        }
      }

      for (let node of mutation.removedNodes) {
        let select = find(node, `#${selectId}`);

        if (select) {
          select.removeEventListener('change', listener);
        }
      }
    }
  }
}).observe(container, {
  subtree: true,
  childList: true,
});
