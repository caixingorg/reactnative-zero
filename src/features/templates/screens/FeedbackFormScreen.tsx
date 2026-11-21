import React, { useState } from 'react';
import { useToast } from '@/core/runtime';
import { FormTemplate, TextField } from '@/core/ui';

export interface FeedbackFormScreenProps {
  onBack?: () => void;
}

export function FeedbackFormScreen({ onBack }: FeedbackFormScreenProps = {}): React.JSX.Element {
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');

  return (
    <FormTemplate
      title="意见反馈"
      onBack={onBack}
      submitLabel="提交反馈"
      onValidate={() => {
        if (subject.trim().length < 2) {
          return '请输入至少 2 个字的反馈主题';
        }
        if (details.trim().length < 5) {
          return '请输入至少 5 个字的详细描述';
        }
        return null;
      }}
      onSubmit={() => {
        toast.show({ message: '反馈已提交，感谢您的建议', tone: 'success' });
        setSubject('');
        setDetails('');
        onBack?.();
      }}
    >
      <TextField
        label="反馈主题"
        placeholder="简述遇到的问题或建议"
        value={subject}
        onChangeText={setSubject}
      />
      <TextField
        label="详细说明"
        placeholder="请补充复现步骤或期望效果"
        value={details}
        onChangeText={setDetails}
        multiline
      />
    </FormTemplate>
  );
}
