import { appService } from '@/UtilServices/appHelper';

export const updateLedger = async (ledgerId: string, payload: any) => {
  const response = await appService.httpClient.put(`service/finance/ledgers/${ledgerId}`, payload);
  return response.data;
};
