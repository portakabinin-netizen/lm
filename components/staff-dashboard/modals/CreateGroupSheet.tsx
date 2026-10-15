import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';

interface CreateGroupSheetProps {
  visible: boolean;
  onClose: () => void;
  userList: any[];
  currentUserRole: string;
}

export const CreateGroupSheet: React.FC<CreateGroupSheetProps> = ({
  visible,
  onClose,
  userList,
  currentUserRole,
}) => {
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const filteredUsers = userList.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name.');
      return;
    }
    if (selectedUsers.length === 0) {
      Alert.alert('Error', 'Please select at least one member.');
      return;
    }
    if (!(currentUserRole === 'CorpAdmin' || currentUserRole === 'userAdmin' || currentUserRole === 'Supervisor' || currentUserRole === 'CorpAdminFull')) {
      Alert.alert('Permission Denied', 'Only Admins and Supervisors can create custom groups.');
      return;
    }
    
    // Stub for backend API call
    Alert.alert(
      'Feature in Development',
      `Group '${groupName}' with ${selectedUsers.length} members would be created here. Backend API integration is required to save this group.`
    );
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContent}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={TOKENS.colors.text.dark} />
              </TouchableOpacity>
              <Text style={styles.title}>New Chat Group</Text>
              <TouchableOpacity onPress={handleCreate}>
                <Text style={styles.createText}>Create</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                placeholder="Group Subject"
                placeholderTextColor={TOKENS.colors.text.muted}
                value={groupName}
                onChangeText={setGroupName}
                style={styles.nameInput}
              />
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={TOKENS.colors.text.muted} />
              <TextInput
                placeholder="Search workers..."
                placeholderTextColor={TOKENS.colors.text.muted}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </View>

            <Text style={styles.subtitle}>Select Members ({selectedUsers.length} selected)</Text>

            <ScrollView style={styles.userList}>
              {filteredUsers.map((user) => (
                <TouchableOpacity
                  key={user._id}
                  style={styles.userRow}
                  onPress={() => toggleUser(user._id)}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userRole}>{user.role}</Text>
                  </View>
                  <Ionicons
                    name={selectedUsers.includes(user._id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={
                      selectedUsers.includes(user._id)
                        ? TOKENS.colors.primary
                        : TOKENS.colors.border.dark
                    }
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: TOKENS.colors.background.main,
    borderTopLeftRadius: TOKENS.radius.lg,
    borderTopRightRadius: TOKENS.radius.lg,
    height: '80%',
    padding: TOKENS.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: TOKENS.spacing.lg,
  },
  title: {
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  createText: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.primary,
  },
  inputContainer: {
    marginBottom: TOKENS.spacing.md,
  },
  nameInput: {
    backgroundColor: TOKENS.colors.background.white,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.md,
    fontSize: TOKENS.typography.size.md,
    color: TOKENS.colors.text.dark,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.light,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.colors.background.white,
    paddingHorizontal: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.full,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.light,
    marginBottom: TOKENS.spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: TOKENS.typography.size.sm,
    color: TOKENS.colors.text.dark,
  },
  subtitle: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.secondaryDark,
    marginBottom: TOKENS.spacing.sm,
  },
  userList: {
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: TOKENS.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.light,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TOKENS.colors.background.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: TOKENS.spacing.md,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TOKENS.colors.text.dark,
  },
  userName: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  userRole: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.muted,
  },
});
