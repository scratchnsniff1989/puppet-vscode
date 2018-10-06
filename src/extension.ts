'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';

import { ConnectionManager } from './connection';
import { ConnectionConfiguration } from './configuration';
import { OutputChannelLogger } from './logging/outputchannel';
import { Reporter } from './telemetry/telemetry';
import { IFeature } from "./feature";
import { setupPuppetCommands } from './commands/puppetcommands';
import { PuppetStatusBar } from './PuppetStatusBar';
import { ISettings, legacySettings, settingsFromWorkspace } from './settings';
import { DebugConfigurationFeature } from './feature/DebugConfigurationFeature';
import { FormatDocumentFeature } from './feature/FormatDocumentFeature';
import { NodeGraphFeature } from './feature/NodeGraphFeature';
import { PDKFeature } from './feature/PDKFeature';
import { PuppetResourceFeature } from './feature/PuppetResourceFeature';

var connManager: ConnectionManager;
var commandsRegistered = false;
const langID = 'puppet'; // don't change this
let extensionFeatures: IFeature[] = [];

export function activate(context: vscode.ExtensionContext) {
  const puppetExtension = vscode.extensions.getExtension('jpogran.puppet-vscode')!;
  const puppetExtensionVersion = puppetExtension.packageJSON.version;

  notifyOnNewExtensionVersion(context, puppetExtensionVersion);

  const settings: ISettings = settingsFromWorkspace();

  context.subscriptions.push(new Reporter(context));
  var logger = new OutputChannelLogger(settings);
  var statusBar = new PuppetStatusBar(langID, context, logger);
  var configSettings = new ConnectionConfiguration();

  // Raise a warning if we detect any legacy settings
  const legacySettingValues: Map<string, Object> = legacySettings();
  if (legacySettingValues.size > 0) {
    let settingNames: string[] = [];
    for (const [settingName, _value] of legacySettingValues) { settingNames.push(settingName); }
    vscode.window.showWarningMessage("Deprecated Puppet settings have been detected. Please either remove them or, convert them to the correct settings names. (" + settingNames.join(", ") + ")", { modal: false});
  }

  if (!fs.existsSync(configSettings.puppetBaseDir)) {
    logger.error('Could not find a valid Puppet installation at ' + configSettings.puppetBaseDir);
    vscode.window
      .showErrorMessage(
        `Could not find a valid Puppet installation at '${
          configSettings.puppetBaseDir
        }'. While syntax highlighting and grammar detection will still work, intellisense and other advanced features will not.`,
        { modal: false },
        { title: 'Troubleshooting Information' }
      )
      .then(item => {
        if (item === undefined) {
          return;
        }
        if (item.title === 'Troubleshooting Information') {
          vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.parse('https://github.com/lingua-pupuli/puppet-vscode#experience-a-problem')
          );
        }
      });
    return null;
  } else {
    logger.debug('Found a valid Puppet installation at ' + configSettings.puppetDir);
  }

  connManager = new ConnectionManager(context, logger, statusBar, configSettings);

  extensionFeatures = [
    new DebugConfigurationFeature(logger, context),
    new FormatDocumentFeature(langID, connManager, settings, logger, context),
    new NodeGraphFeature(langID, connManager, logger, context),
    new PDKFeature(context, logger),
    new PuppetResourceFeature(context, connManager, logger),
  ];

  if (!commandsRegistered) {
    logger.debug('Configuring commands');

    setupPuppetCommands(connManager, context, logger);

    commandsRegistered = true;
  }

  connManager.start(configSettings);
}

// this method is called when your extension is deactivated
export function deactivate() {
  // Dispose all extension features
  extensionFeatures.forEach((feature) => {
    feature.dispose();
  });

  if (connManager !== undefined) {
    connManager.stop();
    connManager.dispose();
  }
}

async function notifyOnNewExtensionVersion(context: vscode.ExtensionContext, version: string) {
  const viewReleaseNotes = 'View Release Notes';
  const suppressUpdateNotice = 'SuppressUpdateNotice';
  const dontShowAgainNotice = "Don't show again";

  if (context.globalState.get(suppressUpdateNotice, false)) {
    return;
  }

  const result = await vscode.window.showInformationMessage(
    `Puppet VSCode has been updated to v${version}`,
    { modal: false },
    { title: dontShowAgainNotice },
    { title: viewReleaseNotes }
  );

  if (result === undefined) {
    return;
  }

  if (result.title === viewReleaseNotes) {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse('https://marketplace.visualstudio.com/items/jpogran.puppet-vscode/changelog')
    );
  } else {
    context.globalState.update(suppressUpdateNotice, true);
  }
}
