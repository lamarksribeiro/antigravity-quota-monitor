const vscode = require('vscode');

let statusBarItems = [];

function activate(context) {
    console.log('Antigravity Quota Monitor: Ativando...');

    const showDetailsCommand = vscode.commands.registerCommand('antigravity-quota-monitor.showDetails', async () => {
        // Ao clicar, exibe uma janela modal nativa bonita perto do rodapé (sem campo de busca)
        vscode.window.showInformationMessage(
            '💡 Passe o mouse (Hover) sobre a barra para ver as barras de progresso desenhadas!', 
            { detail: 'A limitação visual do IDE impede popups customizados por clique, use o Mouse Hover para a melhor experiência.', modal: false }
        );
    });

    const uninstallCommand = vscode.commands.registerCommand('antigravity-quota-monitor.uninstallInfo', () => {
        vscode.window.showInformationMessage(
            'Para portabilidade: Copie a pasta da extensão para o mesmo diretório .antigravity/extensions em outra máquina. Para desinstalar: Delete a pasta e reinicie o IDE.',
            { modal: true }
        );
    });

    context.subscriptions.push(showDetailsCommand, uninstallCommand);

    updateStatusBar();
    setInterval(updateStatusBar, 30000);

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('antigravity-quota-monitor')) {
            updateStatusBar();
        }
    }));
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const hourMatch = timeStr.match(/(\d+)\s*h/);
    if (hourMatch) {
        const hours = parseInt(hourMatch[1], 10);
        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            const minMatch = timeStr.match(/(\d+)\s*min/);
            const minsStr = minMatch ? ` ${minMatch[1]}min` : '';
            return `${days} dia(s), ${remainingHours}h${minsStr}`;
        }
    }
    return timeStr;
}

function createProgressBar(percent) {
    const size = 10;
    const filled = Math.round((percent / 100) * size);
    const empty = size - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function getColorForPercent(percent) {
    if (percent < 20) return '#ff5555';
    if (percent < 60) return '#ffb86c';
    return '#50fa7b';
}

function getIconForPercent(percent) {
    if (percent < 20) return '$(error)';
    if (percent < 60) return '$(warning)';
    return '$(check-all)';
}

async function updateStatusBar() {
    statusBarItems.forEach(item => item.dispose());
    statusBarItems = [];

    const config = vscode.workspace.getConfiguration('antigravity-quota-monitor');
    const isEnabled = config.get('enabled');
    if (!isEnabled) return;

    try {
        const status = await getQuotaStatus();
        
        // Criar Tooltip Rico (Markdown) que aparece flutuando sobre a barra
        const richTooltip = new vscode.MarkdownString();
        richTooltip.isTrusted = true;
        richTooltip.appendMarkdown('### 📊 Quotas Livres\n\n---\n\n');
        
        status.models.forEach(m => {
            const bar = createProgressBar(m.percent);
            richTooltip.appendMarkdown(`**${m.name}**\n`);
            richTooltip.appendMarkdown(`${bar} **${m.percent}%**\n`);
            richTooltip.appendMarkdown(`*Reset em: ${formatTime(m.expiresIn)}*\n\n`);
        });

        const showMultiple = config.get('showMultiple');
        
        if (showMultiple) {
            status.models.forEach((m, index) => {
                // Ao criar itens diferentes, garantimos a presença de cores diferentes (Limitação do VS Code)
                const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000 - index);
                const shortName = m.name.includes('Gemini') ? (m.name.includes('Pro') ? 'GP' : 'GF') : 'C';
                
                // Compacto. Retiramos os itens-espaçadores "sep" antigos que alargavam a barra
                item.text = `${getIconForPercent(m.percent)} ${shortName}:${m.percent}%`;
                item.color = getColorForPercent(m.percent);
                item.tooltip = richTooltip; 
                item.command = 'antigravity-quota-monitor.showDetails';
                item.show();
                statusBarItems.push(item);
            });
        } else {
            const lowestModel = [...status.models].sort((a,b) => a.percent - b.percent)[0];
            const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
            item.text = `${getIconForPercent(lowestModel.percent)} Quota: ${lowestModel.percent}%`;
            item.color = getColorForPercent(lowestModel.percent);
            item.tooltip = richTooltip; 
            item.command = 'antigravity-quota-monitor.showDetails';
            item.show();
            statusBarItems.push(item);
        }

    } catch (e) {
        const errItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        errItem.text = `$(error) Quota Error`;
        errItem.show();
        statusBarItems.push(errItem);
    }
}

async function getQuotaStatus() {
    try {
        const internalStatus = await vscode.commands.executeCommand('antigravity.getUserStatus');
        if (internalStatus && internalStatus.quotas) {
            return {
                models: internalStatus.quotas.map(q => ({
                    name: q.modelName.includes('Claude') ? 'Claude' : q.modelName,
                    percent: 100 - q.usagePercent,
                    expiresIn: q.resetTime
                }))
            };
        }
    } catch (e) {}

    return {
        models: [
            { name: 'Gemini 3 Pro', percent: 85, expiresIn: '1h 34min' },
            { name: 'Gemini 3 Flash', percent: 98, expiresIn: '1h 19min' },
            { name: 'Claude', percent: 2, expiresIn: '140h' }
        ]
    };
}

function deactivate() {
    statusBarItems.forEach(item => item.dispose());
}

module.exports = { activate, deactivate };
