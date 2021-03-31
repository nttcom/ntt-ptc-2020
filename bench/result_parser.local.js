// Check the result file is specified or not.
let resultfile;
if (!process.argv[2]) {
    console.error('第1引数に解析対象のファイルを指定してください');
    process.exit(1);
} else {
    resultfile = process.argv[2];
}

// This array is used for to read RAW result from k6.
const rawResults = [];

// Main process triggered after finished parsing RAW result.
const parseResults = () => {
    const pathsBasedResults = {};

    for (const result of rawResults) {
        const key = result.data.tags.group.split('::').slice(-1)[0];
        pathsBasedResults[key] = pathsBasedResults[key] || {};
        if (result.data.value === 1) {
            pathsBasedResults[key]['OK'] = (pathsBasedResults[key]['OK'] || 0) + 1;
        } else {
            pathsBasedResults[key]['NG'] = (pathsBasedResults[key]['NG'] || 0) + 1;
        }
    }

    // 事後計算が楽なように、NGがないメソッド+URLも、0で初期化する
    preProcessBeforeCalcScore(pathsBasedResults);

    let score = 0;
    for (const k of Object.keys(pathsBasedResults)) {
        if (k.split(' ')[0] === 'GET' && k.split(' ')[1] !== 'StaticFiles') { // Read API
            score += pathsBasedResults[k]['OK'] * 1 - pathsBasedResults[k]['NG'] * 5;
        } else if (k.split(' ')[0] === 'GET' && k.split(' ')[1] === 'StaticFiles') { // Read Static Files
            score += pathsBasedResults[k]['OK'] * 0.1 - pathsBasedResults[k]['NG'] * 5;
        } else { // Write
            score += pathsBasedResults[k]['OK'] * 5 - pathsBasedResults[k]['NG'] * 25;
        }
    }
    // 結果表示
    console.log(score);
    console.log(pathsBasedResults);

    // const firebaseBody = constructBodyForFirebase(score);
    // postDataForDashboard(firebaseBody);
};

const preProcessBeforeCalcScore = resultsList => {
    for (const k of Object.keys(resultsList)) {
        initwithZero(resultsList[k]);
    }
}

const initwithZero = (results) => {
    if (!results['NG']) {
        results['NG'] = 0;
    }
    if (!results['OK']) {
        results['OK'] = 0;
    }
}

// Read results from files
const lineReader = require('readline').createInterface({
    input: require('fs').createReadStream(resultfile)
})

lineReader.on('line', line => {
    const result = JSON.parse(line);
    // Checkの行しかみないので、他の行は読み捨てる
    if (result.metric === 'checks' && result.type === 'Point') {
        rawResults.push(result);
    }
});

lineReader.on('close', () => {
    parseResults();
});
