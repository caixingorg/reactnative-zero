import React, { useState } from 'react';
import { useToast } from '@/core/runtime';
import { AppText, DetailTemplate } from '@/core/ui';

export interface ContentDetailScreenProps {
  title?: string;
  onBack?: () => void;
}

export function ContentDetailScreen({
  title = '通用内容详情模板',
  onBack,
}: ContentDetailScreenProps = {}): React.JSX.Element {
  const toast = useToast();
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);

  return (
    <DetailTemplate
      headerTitle="内容详情"
      title={title}
      subtitle="产品架构组 · 刚刚发布"
      onBack={onBack}
      liked={liked}
      favorited={favorited}
      onToggleLike={() => setLiked((prev) => !prev)}
      onToggleFavorite={() => setFavorited((prev) => !prev)}
      onShare={() => toast.show({ message: '已复制分享链接', tone: 'success' })}
    >
      <AppText variant="bodyMd">
        本页面演示 DetailTemplate
        通用详情页骨架：进入后自动隐藏底部导航、支持左滑返回，并内置底部点赞、收藏与分享操作栏。
      </AppText>
      <AppText variant="bodySm" tone="secondary">
        派生应用可直接复用该模板承载新闻、公告、帖子或审批单详情，无需重复编写头部与底部操作区。
      </AppText>
    </DetailTemplate>
  );
}
