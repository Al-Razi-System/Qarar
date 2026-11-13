import { Badge } from "@/shared/ui/badge";
import { Route } from "lucide-react";
import {
  routingStatusLabel,
  topicPriority,
  topicStatus,
  type Topic,
} from "../model/topic-view";

export function TopicStatusBadge({ topic }: { topic: Topic }) {
  const meta = topicStatus(topic);
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function TopicPriorityBadge({ topic }: { topic: Topic }) {
  const meta = topicPriority(topic);
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function TopicRoutingBadge({ topic }: { topic: Topic }) {
  if (!topic.routing_status) return null;
  return <Badge tone="warning">
    <Route size={13} /> {routingStatusLabel(topic.routing_status)}
  </Badge>;
}
