import os
import webbrowser
import pyautogui
from datetime import datetime
import time
import urllib.parse

from ollama import chat
from gtts import gTTS
from pptx import Presentation

try:
    from selenium import webdriver as selenium_driver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
except ImportError:
    pass

# आवश्यक फ़ोल्डर्स सुनिश्चित करना
os.makedirs(r"C:\Jarvis\Screenshots", exist_ok=True)
os.makedirs(r"C:\Jarvis\Outputs", exist_ok=True)

chat_history = []

# ==================== सोशल मीडिया लिंक्स सेटिंग्स ====================
SOCIAL_LINKS = {
    "facebook": "https://www.facebook.com",
    "youtube": "https://www.youtube.com"  # यहाँ आप अपने चैनल का कम्युनिटी टैब लिंक भी डाल सकते हैं
}
# ====================================================================

def generate_text_content(topic):
    """Gemma4 से टेक्स्ट पोस्ट तैयार करवाना"""
    prompt = f"Create a short social media post in Hindi-English with emojis and hashtags on: {topic}. Give only final post."
    try:
        response = chat(model="gemma4-local:latest", messages=[{"role": "user", "content": prompt}])
        return response["message"]["content"].strip()
    except:
        return f"{topic} पर एक बेहतरीन दिन! #Trending"

def auto_post_to_social(content_text, target_site="facebook"):
    """लिंक के जरिए डायरेक्ट सोशल मीडिया पर जाकर पोस्ट टाइप करना"""
    print("Jarvis: क्रोम ब्राउज़र को सुरक्षित Jarvis Profile मोड में शुरू कर रहा हूँ...")
    chrome_options = Options()
    
    # जार्विस की खुद की अलग प्रोफाइल (इससे प्रोफाइल लॉक का एरर कभी नहीं आएगा)
    user_data_dir = r"C:\Jarvis\JarvisChromeProfile"
    chrome_options.add_argument(f"--user-data-dir={user_data_dir}")
    chrome_options.add_argument("--profile-directory=Default")
    chrome_options.add_argument("--disable-notifications")
    
    # क्रैश और एरर फिक्स करने के लिए जरूरी सेटिंग्स
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    
    try:
        driver = selenium_driver.Chrome(options=chrome_options)
        driver.maximize_window()
        
        # डायरेक्ट लिंक पर जाना
        direct_url = SOCIAL_LINKS.get(target_site, "https://www.google.com")
        print(f"Jarvis: सीधे लिंक पर जा रहा हूँ: {direct_url}")
        driver.get(direct_url)
        
        if "youtube" in target_site:
            print("\n[Jarvis Note]: यूट्यूब पर पहली बार अपना अकाउंट लॉगिन कर लें।")
            print("लॉगिन करने के बाद Create > Create Post पर जाएं, जार्विस खुद टाइप कर देगा।")
            time.sleep(8)
        else:
            time.sleep(6)
            # फेसबुक का पोस्ट बॉक्स ढूंढना
            post_box_triggers = [
                "//span[contains(text(), \"What's on your mind\")]",
                "//span[contains(text(), \"आपके दिमाग में क्या है\")]",
                "//div[@role='button' and contains(., \"What's on your mind\")]"
            ]
            for xpath in post_box_triggers:
                try: 
                    driver.find_element(By.XPATH, xpath).click()
                    break
                except: continue
                
        time.sleep(4)
        print("Jarvis: कंटेंट टाइप कर रहा हूँ...")
        pyautogui.write(content_text, interval=0.01)
        
        print("\n==================================================")
        print(f"Jarvis: {target_site.upper()} पर पोस्ट तैयार है! कृपया फाइनल बटन खुद दबाएं।")
        print("==================================================")
        
    except Exception as e:
        print(f"Jarvis: ऑटो-पोस्टिंग एरर: {e}")

def ask_ai_for_intent(user_text_input):
    prompt = f"""
    Classify user input into one strict category:
    - 'post_text' (regular text post, 'post karo', youtube par post, facebook post)
    - 'post_photo' (photo, image post)
    - 'post_audio' (audio, mp3 post)
    - 'create_ppt' (presentation, ppt)
    - 'open_chrome', 'open_notepad', 'open_calculator', 'take_screenshot', 'volume_up', 'volume_down', 'web_search', 'chat'

    User Input: "{user_text_input}"
    Respond with ONLY the category name. No other text.
    """
    try:
        response = chat(model="gemma4-local:latest", messages=[{"role": "user", "content": prompt}])
        return response["message"]["content"].strip().lower()
    except: return "chat"

print("==========================================================")
print("  Jarvis Multimedia Social Automation v1.6.3 Ready      ")
print("==========================================================")
print("Type 'exit' or 'close' to stop the program.\n")

while True:
    user_text = input("\nYou: ").strip()
    if not user_text: continue
    command = user_text.lower()
    
    if command in ["exit", "close", "quit", "बाय"]: 
        print("Jarvis: Goodbye!")
        break

    intent = ask_ai_for_intent(user_text)
    
    if "post_text" in intent:
        target = "youtube" if "youtube" in command or "यूट्यूब" in command else "facebook"
        topic = input(f"किस टॉपिक पर {target} पोस्ट लिखना है?: ")
        post_text = generate_text_content(topic)
        print(f"\n[Generated Post]:\n{post_text}\n")
        
        confirm = input("क्या आप इसे पोस्ट करना चाहते हैं? (y/n): ").lower()
        if confirm in ['y', 'yes', 'han', 'हाँ', 'yas']:
            auto_post_to_social(post_text, target_site=target)

    # (बाकी के पुराने फीचर्स जैसे PPT बनाना, स्क्रीनशॉट आदि इसमें पहले जैसे ही काम करेंगे)
    elif "create_ppt" in intent:
        topic = input("Topic for PPT: ")
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        slide.shapes.title.text = topic.upper()
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        ppt_path = os.path.join(desktop, f"Jarvis_{datetime.now().strftime('%H%M%S')}.pptx")
        prs.save(ppt_path)
        os.startfile(ppt_path)
        print("PPT Created on Desktop.")
    elif "open_chrome" in intent: os.startfile(os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"))
    elif "open_notepad" in intent: os.startfile("notepad.exe")
    elif "open_calculator" in intent: os.startfile("calc.exe")
    elif "take_screenshot" in intent:
        pyautogui.screenshot().save(os.path.join(r"C:\Jarvis\Screenshots", f"{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.png"))
        print("Screenshot Saved.")
    elif "web_search" in intent:
        webbrowser.open(f"https://www.google.com/search?q={urllib.parse.quote(user_text)}")
    else:
        try:
            chat_history.append({"role": "user", "content": user_text})
            if len(chat_history) > 5: chat_history.pop(0)
            res = chat(model="gemma4-local:latest", messages=chat_history)
            print(f"\nJarvis: {res['message']['content']}")
            chat_history.append({"role": "assistant", "content": res['message']['content']})
        except: print("Jarvis: Ollama Connected nahi hai.")