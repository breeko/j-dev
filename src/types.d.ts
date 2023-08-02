import {Change} from "diff";
import {CreateChatCompletionResponse} from "openai";


interface RequestResponse extends CreateChatCompletionResponse{
  value: string
}

interface RequestBase {
  raw: string
}
interface RequestAccess extends RequestBase{
  type: "access"
  path: string
}

interface RequestChange extends RequestBase {
  type: "change"
  path: string
  content: string
  diff: Change[]
}

interface RequestFollowup extends RequestBase {
  type: "follow-up"
  content: string
}

interface RequestCreate extends RequestBase {
  type: "create"
  path: string
  content: string
}

interface RequestDelete extends RequestBase {
  type: "delete"
  path: string
}

interface RequestComplete extends RequestBase {
  type: "complete"
}

type ParsedResponse =
  RequestAccess |
  RequestChange |
  RequestFollowup |
  RequestCreate |
  RequestDelete |
  RequestComplete
