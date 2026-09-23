import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Box, Flex, Heading, HStack, Button } from "@chakra-ui/react";
import { Dashboard } from "./pages/Dashboard";
import { Alerts } from "./pages/Alerts";
import { Topology } from "./pages/Topology";
import { LiveProvider } from "./live/LiveProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      retry: 1,
    },
  },
});

function NavBar() {
  return (
    <Box bg="gray.800" color="white" px={6} py={3}>
      <Flex justify="space-between" align="center">
        <Heading size="md">Factory Monitor</Heading>
        <HStack spacing={4}>
          <Button as={Link} to="/" variant="ghost" colorScheme="whiteAlpha" size="sm">
            Dashboard
          </Button>
          <Button as={Link} to="/alerts" variant="ghost" colorScheme="whiteAlpha" size="sm">
            Alerts
          </Button>
          <Button as={Link} to="/topology" variant="ghost" colorScheme="whiteAlpha" size="sm">
            Topology
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

function App() {
  return (
    <ChakraProvider>
      <QueryClientProvider client={queryClient}>
        <LiveProvider>
          <BrowserRouter>
            <Box minH="100vh" bg="gray.50">
              <NavBar />
              <Box as="main">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/topology" element={<Topology />} />
                </Routes>
              </Box>
            </Box>
          </BrowserRouter>
        </LiveProvider>
      </QueryClientProvider>
    </ChakraProvider>
  );
}

export default App;
