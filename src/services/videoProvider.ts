import { getSettings } from '../db/database';
import * as byteplus from './seedance';
import * as kie from './kie';

const getProvider = () => {
  const settings = getSettings();
  return settings.api_provider === 'kie' ? kie : byteplus;
};

export const createVideoTask = (
  prompt: string,
  imageInputs: Parameters<typeof byteplus.createVideoTask>[1],
  options?: Parameters<typeof byteplus.createVideoTask>[2]
) => getProvider().createVideoTask(prompt, imageInputs, options);

export const pollTaskStatus = (jobId: string) => getProvider().pollTaskStatus(jobId);

export const resolveDownloadUrl = (url: string) => getProvider().resolveDownloadUrl(url);

export const getCredits = () => kie.getCredits();
