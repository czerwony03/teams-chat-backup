const readline = require('readline');
const Backup = require('./backup');
const axios = require('axios');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask (question) {
  return new Promise((resolve, reject) => {
    rl.question(`${question} `, answer => {
      const value = answer.trim();
      if (value === '') return reject(new Error('missing value'));
      return resolve(answer);
    });
  });
}

const parseResult = ({ data: { '@odata.nextLink': nextLink, value } = {} } = {}) => {
  return {
    nextLink,
    value
  };
};
const parseMyId = ({ data: { id } } = {}) => id;

const buildOutDir = (myId, members, topic) => {
  const result = topic || members.filter(({ userId }) => userId !== myId)
    .map(({ displayName }) => displayName)
    .join(',');
  return result.replace(/\s/g, '_');
};
const autoRun = async (authToken) => {
  const instance = axios.create({
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${authToken}`,
      'Sec-Fetch-Mode': 'cors',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36'
    }
  });

  const myId = await instance.get('https://graph.microsoft.com/beta/me').then(parseMyId);

  let nextPageLink = 'https://graph.microsoft.com/beta/me/chats?$expand=members';
  let hasNextPage = false;
  let otherCount = 0;
  do {
    try {
      const { nextLink, value } = await instance.get(nextPageLink).then(parseResult);
      hasNextPage = !!nextLink;
      for (const {topic, members, id} of value) {
        let dirName = buildOutDir(myId, members, topic);
        if (!dirName) {
          dirName = `OTHER_${otherCount}`;
          otherCount++;
        }
        const backup = new Backup({target: `BACKUP/${dirName}`, chatId: id, authToken});
        try {
          const pages = await backup.getPages();
          if (!!pages.length) {
            await backup.removeFolder();
            await backup.run();
          }
        } catch (_err) {
          await backup.run();
        }
      }
      nextPageLink = nextLink;
    } catch (e) {
      console.log(e);
    }
  } while (hasNextPage);

  return true;
};

async function main () {
  const mode = await ask('Select mode: AUTO or MANUAL:').then(m => m.toLowerCase());
  const authToken = await ask('Enter JWT:');
  if (mode === 'auto') {
    return autoRun(authToken);
  } else {
    const chatId = await ask('Enter chat ID:');
    const target = await ask('Enter target directory name:');

    const backup = new Backup({
      chatId,
      authToken,
      target: `out/${target}`
    });

    return backup.run();
  }
}

main()
  .then(() => rl.close())
  .catch(err => {
    rl.close();
    console.error(err);
  });
