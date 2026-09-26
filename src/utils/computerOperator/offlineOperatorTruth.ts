// ==============================================================================
// HERMES JARVIS — OFFLINE OPERATOR TRUTH
//
// The offline (no-backend) fallback engine still narrated host work the browser
// tab never performed: `fix_project_error` announced a Screen-Research loop that
// opened VS Code and applied a "surgical fix with test verification", and
// `inspect_screen` claimed to be analyzing the active window — neither of which
// the page can do. Both also set `actionExecuted = true` and incremented the
// "Autonomous Actions Executed" counter shown in the Memory panel, so an action
// that never left the tab was recorded as performed host work.
//
// The offline engine can only switch the in-app view. These helpers state that
// plainly and never report OS-level work as executed.
// ==============================================================================

export type OfflineOperatorIntent =
  | 'cancel_computer_task'
  | 'fix_project_error'
  | 'inspect_screen'
  | 'operate_vscode'
  | 'operate_browser'
  | 'operate_terminal'
  | 'open_computer_operator';

export interface OfflineOperatorVerdict {
  /** True only when the page itself performed the action it described. */
  actionExecuted: boolean;
  title: string;
  detailEn: string;
  detailHi: string;
  detailHinglish: string;
}

const VERDICTS: Record<OfflineOperatorIntent, OfflineOperatorVerdict> = {
  cancel_computer_task: {
    actionExecuted: false,
    title: 'Computer Operator View Closed (no host task)',
    detailEn:
      'Closing the Computer Operator view. Offline mode has no running host task to stop, so no host work was cancelled.',
    detailHi:
      'कंप्यूटर ऑपरेटर व्यू बंद किया जा रहा है। ऑफ़लाइन मोड में कोई होस्ट कार्य चल नहीं रहा था, इसलिए कोई होस्ट कार्य रद्द नहीं हुआ।',
    detailHinglish:
      'Computer Operator view band kar raha hoon, Sir. Offline mode mein koi host task chal nahi raha tha.',
  },
  fix_project_error: {
    actionExecuted: false,
    title: 'Computer Operator: Fix Not Executed (offline)',
    detailEn:
      'Opening the Computer Operator view. Offline mode cannot open VS Code or apply a code fix — no project error was inspected or fixed.',
    detailHi:
      'कंप्यूटर ऑपरेटर व्यू खोला जा रहा है। ऑफ़लाइन मोड VS Code नहीं खोल सकता — कोई प्रोजेक्ट त्रुटि नहीं जाँची गई और कोई सुधार लागू नहीं हुआ।',
    detailHinglish:
      'Computer Operator view khol raha hoon, Sir. Offline mode VS Code nahi khol sakta — koi fix apply nahi hua.',
  },
  inspect_screen: {
    actionExecuted: false,
    title: 'Screen Inspection Not Executed (offline)',
    detailEn:
      'Opening the Computer Operator view. Offline mode cannot observe the host desktop, so no screen inspection was performed.',
    detailHi:
      'कंप्यूटर ऑपरेटर व्यू खोला जा रहा है। ऑफ़लाइन मोड होस्ट डेस्कटॉप नहीं देख सकता, इसलिए कोई स्क्रीन निरीक्षण नहीं हुआ।',
    detailHinglish:
      'Computer Operator view khol raha hoon, Sir. Offline mode host desktop observe nahi kar sakta.',
  },
  operate_vscode: {
    actionExecuted: false,
    title: 'Computer Operator: VS Code Launch Unconfirmed (offline)',
    detailEn:
      'Opening the Computer Operator console. Offline mode cannot launch OS applications from the browser, so VS Code was not confirmed as opened.',
    detailHi:
      'कंप्यूटर ऑपरेटर कंसोल खोला जा रहा है। ऑफ़लाइन मोड ब्राउज़र से OS ऐप लॉन्च नहीं कर सकता, इसलिए VS Code खुलने की पुष्टि नहीं हुई।',
    detailHinglish:
      'Computer Operator console khol raha hoon, Sir. Offline mode browser se VS Code launch nahi kar sakta — confirm nahi hua.',
  },
  operate_browser: {
    actionExecuted: false,
    title: 'Computer Operator: In-App Browser View (offline)',
    detailEn:
      'Opening the in-app browser view. Offline mode cannot launch a real Chrome OS window.',
    detailHi:
      'ब्राउज़र टैब अंदर खुल रहा है। ऑफ़लाइन मोड Chrome को OS विंडो के रूप में नहीं खोल सकता।',
    detailHinglish:
      'Browser tab HUD khol raha hoon, Sir. Offline mode OS Chrome window nahi khol sakta.',
  },
  operate_terminal: {
    actionExecuted: false,
    title: 'Computer Operator: In-App Terminal View (offline)',
    detailEn:
      'Opening the in-app terminal console view. Offline mode does not open a real PowerShell window.',
    detailHi:
      'टर्मिनल कंसोल HUD खोला जा रहा है। ऑफ़लाइन मोड में कोई वास्तविक PowerShell विंडो नहीं खुलती।',
    detailHinglish:
      'Terminal console HUD khol raha hoon, Sir. Offline mode mein asli PowerShell window nahi khulti.',
  },
  open_computer_operator: {
    actionExecuted: true,
    title: 'Open Computer Operator HUD',
    detailEn: 'Computer Operator and Screen Researcher HUD activated.',
    detailHi:
      'कंप्यूटर ऑपरेटर और स्क्रीन रिसर्चर कंसोल खोल दिया गया है। आप स्क्रीन विश्लेषण और ऑटोमेशन देख सकते हैं।',
    detailHinglish: 'Computer Operator HUD open kar diya gaya hai, Sir.',
  },
};

export function offlineOperatorVerdict(intent: OfflineOperatorIntent): OfflineOperatorVerdict {
  return VERDICTS[intent];
}

/** The one offline operator intent that is a real, page-local action. */
export function offlineOperatorCountsAsHostWork(intent: OfflineOperatorIntent): boolean {
  return VERDICTS[intent].actionExecuted;
}

export function offlineOperatorReply(
  intent: OfflineOperatorIntent,
  lang: 'hindi' | 'hinglish' | 'english'
): string {
  const verdict = VERDICTS[intent];
  if (lang === 'hindi') return verdict.detailHi;
  if (lang === 'hinglish') return verdict.detailHinglish;
  return verdict.detailEn;
}
