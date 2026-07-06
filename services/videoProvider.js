const { getSettings } = require('../database');
const byteplus = require('./seedance');
const kie = require('./kie');

const getProvider = () => {
  const settings = getSettings();
  return settings.api_provider === 'kie' ? kie : byteplus;
};

module.exports = {
  createVideoTask: (...args) => getProvider().createVideoTask(...args),
  pollTaskStatus: (...args) => getProvider().pollTaskStatus(...args),
  resolveDownloadUrl: (...args) => getProvider().resolveDownloadUrl(...args),
  getCredits: () => kie.getCredits()
};
