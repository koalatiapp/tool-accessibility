'use strict';

const lighthouse = require('lighthouse');
const { URL } = require('url');

class Tool {
    constructor({ page, devices }) {
        this.page = page;
    }

    async run() {
        const lighthouseResults = await this.runLighthouse();
        this._results = this.standardizeWeights(lighthouseResults);
        this._results = this.formatLightouseResults(lighthouseResults);
        this.sortResults();
    }

    get results() {
        return this._results;
    }

    async cleanup() {

    }

    standardizeWeights(lighthouseResults) {
        const totalWeight = lighthouseResults.reduce((total, result) => total + result.weight);
        for (let i = 0; i < lighthouseResults.length; i++) {
            lighthouseResults[i].weight = lighthouseResults[i].weight / totalWeight;
        }
        return lighthouseResults;
    }

    formatLightouseResults(lighthouseResults) {
        const results = [];

        for (const audit of lighthouseResults) {
            const result = {
                'uniqueName': audit.id,
                'title': audit.title,
                'description': audit.description,
                'weight': audit.weight,
                'score': audit.score
            };

            if (audit.score < 1) {
                result.recommendations = audit.description;
            }

            try {
                if (audit.details.items.length) {
                    const table = [[]];

                    for (const column of audit.details.headings) {
                        table[0].push(column.text || (column.label || ''));
                    }

                    for (const rawItem of audit.details.items) {
                        const itemRow = [];

                        for (const column of audit.details.headings) {
                            itemRow.push(this.formatSingleDetail(column, rawItem));
                        }

                        table.push(itemRow);
                    }

                    result.table = table;
                }
            } catch (err) { }

            results.push(result);
        }

        return results;
    }

    formatSingleDetail(column, item) {
        switch (column.valueType) {
			case 'thumbnail':
				return '[![](%s)](%s)'.replace(/%s/g, item[column.key]);

			case 'url':
				return '[%s](%s)'.replace(/%s/g, item[column.key]);
		}

        let contentLines = [];

        if (typeof item[column.key] == 'object') {
            if (typeof item[column.key].snippet != 'undefined') {
                contentLines.push('```\n' + item[column.key].snippet + '\n```');
            } else if (typeof item[column.key].selector != 'undefined') {
                contentLines.push('```\n' + item[column.key].selector + '\n```');
            }

            if (typeof item[column.key].explanation != 'undefined') {
                contentLines = contentLines.concat(item[column.key].explanation.split('\n'));
            }
        }

        return contentLines.join('\n');
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    sortResults() {
        this._results.sort((a, b) => {
            if (a.weight == b.weight) {
                return a.score > b.score ? 1 : -1;
            }

            return a.weight > b.weight ? -1 : 1;
        });
    }

    async runLighthouse() {
        const { lhr } = await lighthouse(this.page.url(), {
            port: (new URL(this.page.browser().wsEndpoint())).port,
            output: 'json',
            onlyCategories: ['accessibility'],
        });
        const audits = [];

        try {
            for (const auditReference of lhr.categories.accessibility.auditRefs) {
                try {
                    const auditData = lhr.audits[auditReference.id];

                    if (!auditData || auditData.score === null) {
                        continue;
                    }

                    const auditReferenceCopy = JSON.parse(JSON.stringify(auditReference));
                    audits.push(Object.assign(auditReferenceCopy, auditData));
                } catch (err) { }
            }
        } catch (err) { }

        return audits;
    }
}

module.exports = Tool;
