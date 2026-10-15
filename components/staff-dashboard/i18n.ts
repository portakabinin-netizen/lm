export type Language = 'en' | 'hi';

const translations: Record<string, Record<Language, string>> = {
  // Tabs & Headers
  'Action': { en: 'Action', hi: 'कार्रवाई' },
  'Work': { en: 'Work', hi: 'काम' },
  'Earning': { en: 'Earning', hi: 'कमाई' },
  'Refresh Status': { en: 'Refresh Status', hi: 'स्थिति ताज़ा करें' },

  'Punch In': { en: 'Punch In', hi: 'पंच इन' },
  'Punch Out': { en: 'Punch Out', hi: 'पंच आउट' },
  'Continue Shift': { en: 'Continue Shift', hi: 'शिफ्ट जारी रखें' },
  'Emergency Duty Off': { en: 'Emergency Duty Off', hi: 'आपातकालीन ड्यूटी ऑफ' },
  'SELECT SITE & SHIFT': { en: 'SELECT SITE & SHIFT', hi: 'साइट और शिफ्ट चुनें' },
  'Select Work Site...': { en: 'Select Work Site...', hi: 'कार्य स्थल चुनें...' },
  'ASSIGNED SHIFT': { en: 'ASSIGNED SHIFT', hi: 'नियुक्त शिफ्ट' },
  'No Site Selected': { en: 'No Site Selected', hi: 'कोई साइट नहीं चुनी गई' },
  'OUT OF BOUNDS': { en: 'OUT OF BOUNDS', hi: 'सीमा से बाहर' },
  'ON DUTY': { en: 'ON DUTY', hi: 'ड्यूटी पर' },
  'OFF DUTY': { en: 'OFF DUTY', hi: 'ड्यूटी समाप्त' },
  'General': { en: 'General', hi: 'सामान्य' },
  'Day': { en: 'Day', hi: 'दिन' },
  'Night': { en: 'Night', hi: 'रात' },
  'Project Site': { en: 'Project Site', hi: 'प्रोजेक्ट साइट' },
  'Started by:': { en: 'Started by:', hi: 'द्वारा शुरू किया गया:' },
  'Marked by:': { en: 'Marked by:', hi: 'द्वारा चिह्नित:' },
  'Supervisor': { en: 'Supervisor', hi: 'सुपरवाइजर' },
  'You are not at the work site': { en: 'You are not at the work site', hi: 'आप कार्यस्थल पर नहीं हैं' },
  'Shift Complete — Continue?': { en: 'Shift Complete — Continue?', hi: 'शिफ्ट पूरी हुई — जारी रखें?' },
  'Your shift has ended. End duty now or start a continued (double) shift.\n⚠️ Supervisors will be notified.': { 
    en: 'Your shift has ended. End duty now or start a continued (double) shift.\n⚠️ Supervisors will be notified.', 
    hi: 'आपकी शिफ्ट समाप्त हो गई है। अभी ड्यूटी समाप्त करें या निरंतर (डबल) शिफ्ट शुरू करें।\n⚠️ सुपरवाइजर को सूचित किया जाएगा।' 
  },
  'LOCKED': { en: 'LOCKED', hi: 'लॉक्ड' },
  'Call': { en: 'Call', hi: 'कॉल करें' },
  'ISSUED ARTICLES': { en: 'ISSUED ARTICLES', hi: 'जारी किए गए सामान' },
  'No articles issued yet': { en: 'No articles issued yet', hi: 'अभी तक कोई सामान जारी नहीं किया गया है' },
  'issued': { en: 'issued', hi: 'जारी किया गया' },
  'returned': { en: 'returned', hi: 'वापस किया गया' },
  'lost': { en: 'lost', hi: 'खो गया' },
  'uniform': { en: 'uniform', hi: 'वर्दी' },
  'equipment': { en: 'equipment', hi: 'उपकरण' },
  'other': { en: 'other', hi: 'अन्य' },
  'Employee': { en: 'Employee', hi: 'कर्मचारी' },

  // Quick Action Tiles
  'Request Leave': { en: 'Request Leave', hi: 'छुट्टी का अनुरोध' },
  'Apply Advance': { en: 'Apply Advance', hi: 'अग्रिम लागू करें' },

  // Attendance & Work
  'Attendance': { en: 'Attendance', hi: 'उपस्थिति' },
  'My Articles': { en: 'My Articles', hi: 'मेरे सामान' },
  'No records found.': { en: 'No records found.', hi: 'कोई रिकॉर्ड नहीं मिला।' },
  'days': { en: 'days', hi: 'दिन' },
  'Total Hours': { en: 'Total Hours', hi: 'कुल घंटे' },
  'Current Month': { en: 'Current Month', hi: 'वर्तमान महीना' },
  'TOTAL PRESENT': { en: 'TOTAL PRESENT', hi: 'कुल उपस्थित' },
  'Days': { en: 'Days', hi: 'दिन' },
  'hrs worked this period': { en: 'hrs worked this period', hi: 'इस अवधि में काम किया गया घंटे' },
  
  // Earnings
  'Total Earned': { en: 'Total Earned', hi: 'कुल कमाई' },
  'Advances / Deductions': { en: 'Advances / Deductions', hi: 'अग्रिम / कटौती' },
  'Net Payable': { en: 'Net Payable', hi: 'कुल देय' },
  'Recent Transactions': { en: 'Recent Transactions', hi: 'हाल के लेन-देन' },
  
  // Modals & General
  'Cancel': { en: 'Cancel', hi: 'रद्द करें' },
  'Submit': { en: 'Submit', hi: 'जमा करें' },
  'Close': { en: 'Close', hi: 'बंद करें' },
  'End Duty': { en: 'End Duty', hi: 'ड्यूटी समाप्त करें' },
  'Enter the reason for leaving early. This will be sent to all admins and recorded.': { 
    en: 'Enter the reason for leaving early. This will be sent to all admins and recorded.', 
    hi: 'जल्दी जाने का कारण दर्ज करें। यह सभी व्यवस्थापकों को भेजा जाएगा और रिकॉर्ड किया जाएगा।' 
  },
  'Enter reason…': { en: 'Enter reason…', hi: 'कारण दर्ज करें…' },
  'Map View Placeholder': { en: 'Map View Placeholder', hi: 'नक्शा दृश्य प्लेसहोल्डर' },
  'Unknown': { en: 'Unknown', hi: 'अज्ञात' },
  'DONE': { en: 'DONE', hi: 'पूर्ण' },

  // New Items (Calendar & Earnings)
  'Previous Month': { en: 'Previous Month', hi: 'पिछला महीना' },
  'Transaction History': { en: 'Transaction History', hi: 'लेन-देन इतिहास' },
  'Salary Paid': { en: 'Salary Paid', hi: 'वेतन भुगतान किया गया' },
  'Salary Dues': { en: 'Salary Dues', hi: 'वेतन देय' },
  'Advance Received': { en: 'Advance Received', hi: 'अग्रिम प्राप्त हुआ' },
  'Penalty': { en: 'Penalty', hi: 'जुर्माना' },
  'Article Issued (Monetary)': { en: 'Article Issued (Monetary)', hi: 'सामान जारी (मौद्रिक)' },
  'Present': { en: 'Present', hi: 'उपस्थित' },
  'Double Duty': { en: 'Double Duty', hi: 'डबल ड्यूटी' },
  'Sun': { en: 'Sun', hi: 'रवि' },
  'Mon': { en: 'Mon', hi: 'सोम' },
  'Tue': { en: 'Tue', hi: 'मंगल' },
  'Wed': { en: 'Wed', hi: 'बुध' },
  'Thu': { en: 'Thu', hi: 'गुरु' },
  'Fri': { en: 'Fri', hi: 'शुक्र' },
  'Sat': { en: 'Sat', hi: 'शनि' },
};

export const t = (key: string | undefined | null, lang: Language): string => {
  if (!key) return '';
  if (!translations[key]) {
    // Attempt generic backend fallbacks if exact match not found
    if (lang === 'hi') {
      if (key.toLowerCase().includes('site')) return key.replace(/site/i, 'साइट');
    }
    return key;
  }
  return translations[key][lang] || translations[key]['en'];
};
