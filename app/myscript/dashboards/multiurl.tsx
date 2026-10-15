import * as WebBrowser from 'expo-web-browser';

const handleAction = async (
  type: "manual" | "whatsapp" | "call" | "status_action" | "website", 
  customValue?: string
) => {
  let url = "";
  let actionText = "";

  switch (type) {
    case "whatsapp":
      url = `https://wa.me/${mobile}`;
      actionText = "WhatsApp message sent";
      break;
    case "call":
      url = `tel:${mobile}`;
      actionText = "Phone call made";
      break;
    case "website":
      url = customValue || "https://yourdefaultsite.com"; 
      actionText = `Visited website: ${url}`;
      break;
    case "status_action":
      actionText = customValue || "";
      break;
    case "manual":
      actionText = customValue || newActivity;
      break;
  }

  if (!actionText.trim()) return;

  // --- OPENING THE BROWSER OR EXTERNAL APP ---
  try {
    if (url) {
      if (type === "website") {
        // Opens inside the app (better UX)
        await WebBrowser.openBrowserAsync(url);
      } else {
        // Opens Phone or WhatsApp app
        await Linking.openURL(url);
      }
    }

    // --- LOGGING TO BACKEND ---
    const sessionString = await AsyncStorage.getItem("userSession");
    const session = sessionString ? JSON.parse(sessionString) : null;

    await axios.post(
      `${api_url}/service/${item._id}/activity`,
      {
        action: actionText,
        byUser: session?.userDisplayName || "System",
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    onStatusChange?.();

    if (type === "manual") {
      showGlobalToast("Activity recorded", "Success");
      setNewActivity("");
      setActivityModal(false);
    }
  } catch (error: any) {
    console.log("Action Error:", error.message);
  }
};