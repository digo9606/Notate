import java.util.Scanner;
import com.theokanning.openai.service.OpenAiService;
import com.theokanning.openai.completion.chat.ChatCompletionRequest;
import com.theokanning.openai.completion.chat.ChatCompletionMessage;
import java.util.List;

public class AIChatbot {
    public static void main(String[] args) {
        String apiKey = "your-api-key-here"; // Replace with your actual API key
        OpenAiService service = new OpenAiService(apiKey);
        Scanner scanner = new Scanner(System.in);

        while (true) {
            System.out.print("You: ");
            String userInput = scanner.nextLine();

            if (userInput.equalsIgnoreCase("exit") || userInput.equalsIgnoreCase("quit") || userInput.equalsIgnoreCase("bye")) {
                System.out.println("AI: Goodbye!");
                break;
            }

            ChatCompletionRequest request = ChatCompletionRequest.builder()
                    .model("gpt-3.5-turbo")
                    .messages(List.of(
                            new ChatCompletionMessage("system", "You are a helpful AI assistant."),
                            new ChatCompletionMessage("user", userInput)
                    ))
                    .build();

            String response = service.createChatCompletion(request).getChoices().get(0).getMessage().getContent();
            System.out.println("AI: " + response);
        }
        scanner.close();
    }
}
