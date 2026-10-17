import { formatDate, formatMobile } from "@/backend/middleware/validateAuth";
import api_url from "@/backend/routes/base_url";
import { showGlobalToast } from "@/hooks/commomFunction";
import { LeadTileProps } from "@/hooks/interface";
import { FontAwesome, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import React, { useState } from "react";
import {
  Linking,
  Modal,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "./styles/TileStyles";

const LeadTile: React.FC<LeadTileProps> = ({
  item,
  token,
  onStatusChange,
  isFirst = false,
}) => {
  const mobile = formatMobile(item.sender_mobile)?.withPlus91;
  const [isEditing, setIsEditing] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [activityModal, setActivityModal] = useState(false);
  const [newActivity, setNewActivity] = useState("");
  
  const [editedItem, setEditedItem] = useState({
    sender_name: item.sender_name,
    sender_city: item.sender_city,
    sender_state: item.sender_state,
    product_name: item.product_name,
    sender_email: item.sender_email,
  });

  const isLeadAccepted = String(item.status) === "Accepted";
  const activities = Array.isArray(item.activity) ? item.activity : [];
  const lastActivity = activities.length > 0 ? activities[activities.length - 1] : null;

  const handleInputChange = (field: string, value: string) => {
    setEditedItem((prev) => ({ ...prev, [field]: value }));
  };

  const cancelEditing = () => {
    setEditedItem({
      sender_name: item.sender_name,
      sender_city: item.sender_city,
      sender_state: item.sender_state,
      product_name: item.product_name,
      sender_email: item.sender_email,
    });
    setIsEditing(false);
  };

  const saveAllChanges = async () => {
    try {
      await axios.put(`${api_url}/service/leads/${item._id}`, editedItem, { headers: { Authorization: `Bearer ${token}` } });
      showGlobalToast("Lead details updated!","Success");
      setIsEditing(false);
      onStatusChange?.();
    } catch {
      showGlobalToast("Failed to update lead","Error");
    }
  };


// Updated the 'type' parameter to include "status_action"
const handleShareLead = async () => {
  try {
    const sessionString = await AsyncStorage.getItem("userSession");
    const session = sessionString ? JSON.parse(sessionString) : null;
    const clientName = item.sender_name || 'N/A';
    const clientPhone = item.sender_mobile || mobile || 'N/A';
    const location = [item.sender_city, item.sender_state].filter(Boolean).join(', ') || 'N/A';
    const leadDate = formatDate(item.generated_date);
    const repName = session?.userDisplayName || session?.corporateName || 'Sales Team';

    const leadDetailsMessage =
      `📋 *LEAD INQUIRY DETAILS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      (item.lead_no ? `🆔 *Inquiry #:* ${item.lead_no}\n` : '') +
      `👤 *Client Name:* ${clientName}\n` +
      `📱 *Mobile:* ${clientPhone}\n` +
      (item.sender_email ? `✉️ *Email:* ${item.sender_email}\n` : '') +
      `📦 *Requirement:* ${item.product_name || 'N/A'}\n` +
      `📍 *Location:* ${location}\n` +
      (item.source ? `🏷️ *Source:* ${item.source}\n` : '') +
      `📅 *Date:* ${leadDate}\n` +
      (item.query_message ? `💬 *Query:* ${item.query_message}\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Forwarded by: ${repName}`;

    const waShareUrl = `whatsapp://send?text=${encodeURIComponent(leadDetailsMessage)}`;
    const waWebShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(leadDetailsMessage)}`;

    let shared = false;
    try {
      const supported = await Linking.canOpenURL(waShareUrl);
      if (supported) {
        await Linking.openURL(waShareUrl);
        shared = true;
      } else {
        const webSupported = await Linking.canOpenURL(waWebShareUrl);
        if (webSupported) {
          await Linking.openURL(waWebShareUrl);
          shared = true;
        }
      }
    } catch (e) {
      console.warn("Share lead error", e);
    }

    if (!shared) {
      try {
        await Share.share({
          message: leadDetailsMessage,
          title: `Lead #${item.lead_no || ''} - ${clientName}`,
        });
      } catch {
        showGlobalToast("Could not share lead", "Error");
        return;
      }
    }

    await axios.post(
      `${api_url}/service/${item._id}/activity`,
      {
        action: "Lead details shared via WhatsApp",
        byUser: session?.userDisplayName || "System",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    onStatusChange?.();
  } catch (error: any) {
    console.log("Share lead error:", error);
  }
};

const handleAction = async (
  type: "manual" | "whatsapp" | "call" | "status_action", 
  customAction?: string
) => {
  let url = "";
  let actionText = "";

  const sessionString = await AsyncStorage.getItem("userSession");
  const session = sessionString ? JSON.parse(sessionString) : null;

  switch (type) {
    case "whatsapp": {
      const cleanPhone = (item.sender_mobile || mobile || '').replace(/\D/g, '').slice(-10);
      const targetPhone = cleanPhone ? `91${cleanPhone}` : (mobile || '');
      const company = session?.corporateName || 'portakabin.in';
      const repName = session?.userDisplayName || 'Sales Team';
      const userMobile = session?.userMobile || session?.mobile || '';
      const corporateEmail = session?.corporateEmail || '';
      const corporateAddress = session?.corporateAddress || '';
      const corpProfileImage = session?.CorpProfileImage || '';
      const clientName = (item.sender_name || '').trim();

      const count = activities.length;
      let waMessage = '';

      if (count === 0) {
        // 1) 0 activity: send welcome message to sender_mobile of lead
        waMessage =
          `👋 *WELCOME TO ${company.toUpperCase()}*\n\n` +
          `Dear *${clientName || 'Customer'}*,\n\n` +
          `Thank you for your valuable inquiry regarding ${item.product_name ? `*${item.product_name}*` : 'our products/services'}.\n\n` +
          `We have received your requirement and our team is ready to assist you with complete specifications, technical details, and the best quote.\n\n` +
          `Please let us know if you have any questions or additional requirements.\n\n` +
          `Warm Regards,\n` +
          `👤 *${repName}*\n` +
          `🏢 *${company}*\n` +
          (userMobile ? `📱 Mobile: ${userMobile}\n` : '') +
          (corporateEmail ? `✉️ Email: ${corporateEmail}\n` : '') +
          (corporateAddress ? `📍 Address: ${corporateAddress}\n` : '');

        actionText = `Welcome message sent via WhatsApp to ${cleanPhone || targetPhone}`;
      } else if (count === 1) {
        // 2) 1 activity: send digital visiting card to sender_mobile
        waMessage =
          `📇 *DIGITAL VISITING CARD*\n\n` +
          `🏢 *${company}*\n` +
          (corpProfileImage ? `🖼️ Profile: ${corpProfileImage}\n` : '') +
          `👤 *${repName}*\n` +
          (userMobile ? `📱 Mobile: ${userMobile}\n` : '') +
          (corporateEmail ? `✉️ Email: ${corporateEmail}\n` : '') +
          (corporateAddress ? `📍 Address: ${corporateAddress}\n` : '') +
          (item.product_name ? `\n📦 *Requirement:* ${item.product_name}\n` : '') +
          `\nFeel free to connect with us anytime!`;

        actionText = `Digital visiting card sent via WhatsApp to ${cleanPhone || targetPhone}`;
      } else {
        // 3) more than 1 activity: open sender_mobile for user own message
        waMessage = '';
        actionText = `WhatsApp chat opened for ${cleanPhone || targetPhone}`;
      }

      url = waMessage
        ? `whatsapp://send?phone=${targetPhone}&text=${encodeURIComponent(waMessage)}`
        : `whatsapp://send?phone=${targetPhone}`;
      break;
    }
    case "call":
      url = `tel:${mobile}`;
      actionText = "Phone call made";
      break;
    case "status_action":
      // This allows us to pass "Quotation sent" or "Profile Shared" as customAction
      actionText = customAction || ""; 
      break;
    case "manual":
      actionText = customAction || newActivity;
      break;
  }

  // Validation
  if (!actionText.trim()) return;

  // Open External App (WhatsApp or Phone)
  if (url) {
    Linking.openURL(url).catch((err) => console.log("Linking Error:", err));
  }

  try {
    // Save to Backend
    await axios.post(
      `${api_url}/service/${item._id}/activity`,
      {
        action: actionText,
        byUser: session?.userDisplayName || "System",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    onStatusChange?.();

    // Specific UI logic for Manual entry or Status Actions
    if (type === "manual") {
      showGlobalToast("Activity recorded", "Success");
      setNewActivity("");
      setActivityModal(false);
    } else if (type === "status_action") {
      showGlobalToast(`Log: ${actionText}`, "Success");
    }

  } catch (error: any) {
    console.log("Activity Error:", error.response?.data || error.message);
    if (type === "manual" || type === "status_action") {
      showGlobalToast("Failed to save activity", "Error");
    }
  }
};
  
const updateStatus = async (newStatus: string) => {
  const activityOnlyActions = ["Share Profile", "Quotation", "Tax Invoice"];

  if (activityOnlyActions.includes(newStatus)) {
    // 1. Record the activity (Fixes the TypeScript error)
    await handleAction("status_action", `${newStatus} processed`);

    // 2. Perform Routing / Navigation
    if (newStatus === "Share Profile") {
       // navigation.navigate("ProfileShareScreen", { id: item._id });
       console.log("Navigating to Profile Share...");
    } else if (newStatus === "Quotation") {
       // navigation.navigate("CreateQuotation", { id: item._id });
       console.log("Navigating to Quotation...");
    } else if (newStatus === "Tax Invoice") {
       // navigation.navigate("InvoiceScreen", { id: item._id });
       console.log("Navigating to Invoice...");
    }

    setStatusModal(false);
    return; // Stops execution so the status isn't updated via API
  }

  // Regular Status Update Logic
  try {
    await axios.put(
      `${api_url}/service/leads/${item._id}`, 
      { status: newStatus }, 
      { headers: { Authorization: `Bearer ${token}` } }
    );
    showGlobalToast(`Status updated to: ${newStatus}`, "Success");
    setStatusModal(false);
    onStatusChange?.();
  } catch {
    showGlobalToast("Update failed", "Error");
  }
};

  const statusOptions: Record<string, string[]> = {
    Recent: ["Share Profile","Engaged", "Delete"],
    Engaged: ["Quotation","Accepted", "Delete"],
    Accepted: ["Tax Invoice"],
    Delete: ["Engaged","Restore"],
  };
  const availableStatus = statusOptions[item.status as string] || [];

  return (
    <View style={[styles.tile, isFirst && styles.firstTile]}>
      {/* HEADER SECTION */}
      <View style={styles.headerRow}>
        <View style={styles.idBox}><Text style={styles.idText}>Lead #{item.lead_no} | Source Id: {item.source_id}</Text></View>
        <View style={styles.headerActions}>
          {isEditing ? (
            <View style={styles.editActionsGroup}>
              <TouchableOpacity onPress={cancelEditing}><MaterialIcons name="close" size={22} color="#E53935" /></TouchableOpacity>
              <TouchableOpacity onPress={saveAllChanges} style={styles.saveBtnPill}>
                <MaterialIcons name="check" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={() => setIsEditing(true)}><MaterialIcons name="edit" size={20} color="#007AFF" /></TouchableOpacity>
              <TouchableOpacity style={[styles.statusBadge, isLeadAccepted && styles.acceptedBadge]} onPress={() => setStatusModal(true)}>
                <Text style={[styles.statusText, isLeadAccepted && styles.whiteText]}>{item.status}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* CONTENT SECTION */}
      <View style={styles.content}>
        <Text style={styles.sourceDate}>Source : {item.source} | Date : {formatDate(item.generated_date)}</Text>
        <EditableField label="Buyer" value={editedItem.sender_name} isEditing={isEditing} onChange={(v: string) => handleInputChange("sender_name", v)} />
        <EditableField label="Email" value={editedItem.sender_email} isEditing={isEditing} onChange={(v: string) => handleInputChange("sender_email", v)} /> 
        <EditableField label="Product" value={editedItem.product_name} isEditing={isEditing} onChange={(v: string) => handleInputChange("product_name", v)} />
        <Text style={styles.infoText}>{item.sender_city}, {item.sender_state}</Text>
       <View style={styles.actions}>
  <Text style={styles.phoneText}>{mobile}</Text>
  
  {/* Call Button */}
  <TouchableOpacity 
    onPress={() => handleAction("call")} 
    style={[styles.btn, {backgroundColor: '#E8F2FF'}]}
  >
    <MaterialIcons name="call" size={25} color="#007AFF" />
  </TouchableOpacity>

  {/* WhatsApp Button */}
  <TouchableOpacity 
    onPress={() => handleAction("whatsapp")} 
    style={[styles.btn, {backgroundColor: '#E7F9ED'}]}
  >
    <FontAwesome name="whatsapp" size={25} color="#25D366" />
  </TouchableOpacity>

  {/* Share Lead Button */}
  <TouchableOpacity 
    onPress={handleShareLead} 
    style={[styles.btn, {backgroundColor: '#E8F2FF'}]}
  >
    <MaterialCommunityIcons name="share-variant" size={22} color="#007AFF" />
  </TouchableOpacity>
  
  {/* Email Button - Optional: You can add handleAction("email") if desired */}
  {item.sender_email ? (
    <TouchableOpacity onPress={() => Linking.openURL(`mailto:${item.sender_email}`)} style={[styles.btn, {backgroundColor: '#FFF4E5'}]}>
      <MaterialIcons name="email" size={25} color="#FF9500" />
    </TouchableOpacity>
  ) : null}
</View>
      </View>
     
      {/* ACTIVITY SECTION */}
      <View style={styles.activitySection}>
        <View style={styles.activityHeaderRow}>
          <TouchableOpacity style={styles.activityLabelGroup} onPress={() => setShowAllActivities(!showAllActivities)}>
            <Text style={styles.activityLabel}>Last Action: <Text style={styles.activityRowText}>
  {lastActivity ? (
    <>
      {formatDate(lastActivity.date)}: <Text style={{ fontWeight: '600' }}>{lastActivity.action}{"->"}{lastActivity.byUser}</Text> 
      
        </>
      ) : (
    "No recent activity"
     )}
    </Text></Text>
            {activities.length > 0 && <MaterialIcons name={showAllActivities ? "expand-less" : "expand-more"} size={18} color="#666" />}
          </TouchableOpacity>
          
          {/* ADD ACTIVITY ICON */}
          <TouchableOpacity onPress={() => setActivityModal(true)} style={styles.addActivityBtn}>
            <MaterialIcons name="playlist-add" size={22} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {showAllActivities && activities.length > 0 && (
          <View style={styles.activityList}>
            {activities.map((act: any, i: number) => (
              <View key={i} style={styles.activityItem}>
                <Text style={styles.activityRowText}>{formatDate(act.date)}-<Text style={{fontWeight: '600'}}>{act.action}</Text>{"->"}{act.byUser}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* FOOTER SECTION */}
      

      {/* ADD ACTIVITY MODAL */}
      <Modal visible={activityModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add New Activity</Text>
            <TextInput 
              style={styles.textArea} 
              placeholder="e.g., Called customer, confirmed price..." 
              multiline 
              numberOfLines={4}
              value={newActivity}
              onChangeText={setNewActivity}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setActivityModal(false)} style={styles.cancelLink}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity 
              onPress={() => handleAction("manual")} 
              style={styles.saveBtnPill}
            >
  <Text style={styles.saveBtnText}>New Activity</Text>
</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* STATUS MODAL */}
      <Modal visible={statusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Change Status</Text>
            {availableStatus.map((s) => (
              <TouchableOpacity key={s} onPress={() => updateStatus(s)} style={styles.option}><Text style={styles.optionText}>{s}</Text></TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setStatusModal(false)} style={styles.closeBtn}><Text style={{color: '#E53935'}}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const EditableField = ({ label, value, isEditing, onChange }: any) => (
  <View style={styles.fieldRow}>
    {isEditing ? (
      <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={label} />
    ) : (
      <Text style={label === "Buyer" ? styles.nameText : styles.productText}>{value}</Text>
    )}
  </View>
);

export default LeadTile;